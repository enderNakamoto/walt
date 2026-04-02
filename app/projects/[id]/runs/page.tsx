import { getProject, getAgents, getTestRuns } from "@/lib/supabase";
import { notFound } from "next/navigation";
import RunResults from "@/components/RunResults";

export default async function RunsPage({
  params,
}: {
  params: { id: string };
}) {
  const project = await getProject(params.id);
  if (!project) notFound();

  const agents = await getAgents(project.id);
  const agent = agents[0] ?? null;

  const runs = agent ? await getTestRuns(agent.id) : [];

  return (
    <div className="min-h-screen bg-background p-6">
      <RunResults
        project={project}
        agentId={agent?.id ?? null}
        hasTestCode={!!agent?.test_code}
        initialRuns={runs}
      />
    </div>
  );
}
