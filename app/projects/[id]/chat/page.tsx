import { getProject } from "@/lib/supabase";
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

  return (
    <div className="flex h-screen flex-col bg-background">
      <ChatWindow project={project} />
    </div>
  );
}
