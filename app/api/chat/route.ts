import { createSSEStream } from "@/lib/sse";
import { conversationRound } from "@/lib/agent/conversation";
import { getAgent } from "@/lib/supabase";

export async function POST(request: Request) {
  const { agentId, message } = await request.json();

  // Validate inputs
  if (!agentId || !message?.trim()) {
    return new Response(
      JSON.stringify({ error: "agentId and message are required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Verify agent exists
  const agent = await getAgent(agentId);
  if (!agent) {
    return new Response(
      JSON.stringify({ error: "Agent not found" }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  const sse = createSSEStream();

  // Start conversation in background — don't await
  conversationRound(agentId, message.trim(), sse).catch((err) => {
    sse.send({ type: "error", message: err.message || "Chat failed" });
    sse.close();
  });

  return sse.response();
}
