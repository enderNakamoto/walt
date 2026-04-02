import { getProject, getAgents, createAgent } from "@/lib/supabase";
import { notFound } from "next/navigation";
import ChatWindow from "@/components/ChatWindow";

export const dynamic = "force-dynamic";

export default async function ChatPage({
  params,
}: {
  params: { id: string };
}) {
  const project = await getProject(params.id);
  if (!project) notFound();

  // Get or create agent for this project
  // Prefer the agent that already has test code
  let agents = await getAgents(project.id);
  let agent = agents.find((a) => a.test_code) ?? agents[0];
  if (!agent) {
    agent = await createAgent({
      project_id: project.id,
      name: "Test Agent",
      description: "Auto-created test agent",
    });
  }

  const agentId = agent.id;

  return (
    <div className="flex h-screen flex-col bg-background">
      <ChatWindow project={project} agentId={agentId} />
    </div>
  );
}
