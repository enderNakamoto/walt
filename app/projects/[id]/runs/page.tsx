import { getProject, getAgents, getTestRuns } from "@/lib/supabase";
import { notFound } from "next/navigation";
import RunResults from "@/components/RunResults";

export const dynamic = "force-dynamic";

export default async function RunsPage({
  params,
}: {
  params: { id: string };
}) {
  const project = await getProject(params.id);
  if (!project) notFound();

  const agents = await getAgents(project.id);
  // Pick the agent that has test code, or fall back to the first one
  const agent = agents.find((a) => a.test_code) ?? agents[0] ?? null;

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
