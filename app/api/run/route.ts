import { createSSEStream } from "@/lib/sse";
import { runTest } from "@/lib/runner";
import { getAgent, getProject } from "@/lib/supabase";

export async function POST(request: Request) {
  const { agentId } = await request.json();

  if (!agentId) {
    return new Response(
      JSON.stringify({ error: "agentId is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const agent = await getAgent(agentId);
  if (!agent) {
    return new Response(
      JSON.stringify({ error: "Agent not found" }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!agent.test_code) {
    return new Response(
      JSON.stringify({ error: "Agent has no test code — generate a test first" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const project = await getProject(agent.project_id);
  if (!project) {
    return new Response(
      JSON.stringify({ error: "Project not found" }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  const sse = createSSEStream();

  // Start test run in background — don't await
  runTest(
    agent.test_code,
    project.dapp_url,
    project.wallet_secret,
    agentId,
    sse,
  ).catch((err) => {
    sse.send({ type: "error", message: err.message || "Run failed" });
    sse.close();
  });

  return sse.response();
}
