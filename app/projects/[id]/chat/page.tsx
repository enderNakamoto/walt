import { getProject, getAgents, createAgent } from "@/lib/supabase";
import { notFound } from "next/navigation";
import ChatWindow from "@/components/ChatWindow";

export default async function ChatPage({
  params,
}: {
  params: { id: string };
}) {
  const project = await getProject(params.id);
  if (!project) notFound();

  // Get or create agent for this project
  let agents = await getAgents(project.id);
  if (agents.length === 0) {
    const agent = await createAgent({
      project_id: project.id,
      name: "Test Agent",
      description: "Auto-created test agent",
    });
    agents = [agent];
  }

  const agentId = agents[0].id;

  return (
    <div className="flex h-screen flex-col bg-background">
      <ChatWindow project={project} agentId={agentId} />
    </div>
  );
}
