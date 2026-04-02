import { getProject } from "@/lib/supabase";
import { notFound } from "next/navigation";
import ExplorationViewer from "@/components/ExplorationViewer";

export default async function ExplorePage({
  params,
}: {
  params: { id: string };
}) {
  const project = await getProject(params.id);
  if (!project) notFound();

  return (
    <div className="min-h-screen bg-background p-6">
      <ExplorationViewer project={project} />
    </div>
  );
}
