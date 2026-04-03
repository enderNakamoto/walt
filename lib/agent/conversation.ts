import type Anthropic from "@anthropic-ai/sdk";
import { chatWithTools } from "../claude";
import {
  getAgent,
  getProject,
  getSnapshots,
  getMessages,
  createMessage,
  updateAgentTestCode,
} from "../supabase";
import { buildSystemPrompt } from "./prompts";
import { tools, executeTool } from "./tools";
import type { SSEWriter, ExplorationData } from "../types";

export async function conversationRound(
  agentId: string,
  userMessage: string,
  sse: SSEWriter,
): Promise<void> {
  try {
    sse.send({ type: "status", message: "Thinking..." });

    // Load history from DB
    const history = await loadMessages(agentId);
    history.push({ role: "user", content: userMessage });
    await saveMessage(agentId, "user", userMessage);

    // Load exploration data for context
    const explorationData = await loadExplorationData(agentId);
    const systemPrompt = buildSystemPrompt(explorationData);

    // Agent loop — runs until Claude stops calling tools
    while (true) {
      const response = await chatWithTools(systemPrompt, history, tools);

      // Add Claude's response to history
      history.push({ role: "assistant", content: response.content });

      // Handle end of turn — Claude is done
      if (response.stop_reason === "end_turn") {
        for (const block of response.content) {
          if (block.type === "text") {
            sse.send({ type: "text", content: block.text });
            await saveMessage(agentId, "assistant", block.text);
          }
        }
        break;
      }

      // Handle tool calls
      if (response.stop_reason === "tool_use") {
        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const block of response.content) {
          if (block.type === "tool_use") {
            // Special case: ask_question breaks the loop
            if (block.name === "ask_question") {
              const question = (block.input as Record<string, string>).question;
              sse.send({ type: "question", content: question });
              await saveMessage(agentId, "assistant", question, {
                tool_call: "ask_question",
              });
              sse.send({ type: "waiting_for_user" });
              return;
            }

            // Special case: generate_test saves the code
            if (block.name === "generate_test") {
              const input = block.input as Record<string, string>;
              await saveTestCode(agentId, input.code, {
                name: input.name,
                description: input.description,
              });
              sse.send({ type: "test_code", code: input.code });
              toolResults.push({
                type: "tool_result",
                tool_use_id: block.id,
                content: JSON.stringify({ success: true }),
              });
              continue;
            }

            // General tool execution
            sse.send({
              type: "status",
              message: `Using tool: ${block.name}...`,
            });
            const result = await executeTool(
              block.name,
              block.input as Record<string, unknown>,
            );
            sse.send({ type: "tool", name: block.name, result });
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: JSON.stringify(result),
            });
          }
        }

        // Feed results back to Claude
        history.push({ role: "user", content: toolResults });
      }
    }

    sse.send({ type: "done" });
  } finally {
    sse.close();
  }
}

// ── Message persistence ──

async function loadMessages(
  agentId: string,
): Promise<Anthropic.MessageParam[]> {
  const messages = await getMessages(agentId);
  return messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));
}

async function saveMessage(
  agentId: string,
  role: "user" | "assistant",
  content: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await createMessage({
    agent_id: agentId,
    role,
    content,
    metadata: metadata ?? null,
  });
}

async function saveTestCode(
  agentId: string,
  code: string,
  meta?: { name?: string; description?: string },
): Promise<void> {
  await updateAgentTestCode(agentId, code, meta);
}

// ── Exploration data loader ──

async function loadExplorationData(
  agentId: string,
): Promise<ExplorationData> {
  const agent = await getAgent(agentId);
  if (!agent) throw new Error(`Agent not found: ${agentId}`);

  const project = await getProject(agent.project_id);
  if (!project) throw new Error(`Project not found: ${agent.project_id}`);

  // Try cached exploration_data first
  if (project.exploration_data) {
    return project.exploration_data;
  }

  // Fall back to building from snapshots
  const snapshots = await getSnapshots(project.id);
  return {
    dappUrl: project.dapp_url,
    snapshots: snapshots
      .filter((s) => s.dom_summary && s.selectors)
      .map((s) => ({
        url: s.url,
        dom_summary: s.dom_summary!,
        selectors: s.selectors!,
      })),
  };
}
