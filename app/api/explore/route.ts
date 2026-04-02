import { createSSEStream } from "@/lib/sse";
import { explore } from "@/lib/agent/explorer";
import { getProject } from "@/lib/supabase";

export async function POST(request: Request) {
  const { projectId, dappUrl } = await request.json();

  // Validate inputs
  if (!projectId || !dappUrl) {
    return new Response(
      JSON.stringify({ error: "projectId and dappUrl are required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    new URL(dappUrl);
  } catch {
    return new Response(
      JSON.stringify({ error: "dappUrl must be a valid URL" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Load project to get wallet secret
  const project = await getProject(projectId);
  if (!project) {
    return new Response(
      JSON.stringify({ error: "Project not found" }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  const sse = createSSEStream();

  // Use AbortController to handle client disconnect
  const abortController = new AbortController();
  request.signal.addEventListener("abort", () => {
    abortController.abort();
  });

  // Start exploration in background — don't await
  explore(
    dappUrl,
    project.wallet_secret,
    sse,
    projectId,
    abortController.signal,
  ).catch((err) => {
    sse.send({ type: "error", message: err.message || "Exploration failed" });
    sse.close();
  });

  return sse.response();
}
