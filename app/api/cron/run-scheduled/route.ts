import { NextResponse } from "next/server";
import { getDueAgents, getProject, updateAgentSchedule, createScheduledReport } from "@/lib/supabase";
import { runTestHeadless } from "@/lib/runner";

const SCHEDULE_MS: Record<string, number> = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '48h': 48 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
};

export async function GET(request: Request) {
  // Security check
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get('authorization');
    const vercelCron = request.headers.get('x-vercel-cron');
    if (auth !== `Bearer ${cronSecret}` && !vercelCron) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const dueAgents = await getDueAgents();
  const results = [];

  for (const agent of dueAgents) {
    if (!agent.test_code) continue;

    const project = await getProject(agent.project_id);
    if (!project) continue;

    try {
      const result = await runTestHeadless(
        agent.test_code,
        project.dapp_url,
        project.wallet_secret,
        agent.id,
      );

      // Generate summary
      const passedCount = result.steps.filter(s => s.status === 'passed').length;
      const totalCount = result.steps.length;
      const summary = result.status === 'passed'
        ? `All ${totalCount} steps passed in ${(result.durationMs / 1000).toFixed(1)}s`
        : `${passedCount}/${totalCount} steps passed. Failed: ${result.steps.find(s => s.status !== 'passed')?.name ?? 'unknown'}`;

      await createScheduledReport({
        agent_id: agent.id,
        test_run_id: result.testRunId,
        status: result.status,
        summary,
        steps: result.steps,
        healing_summary: result.healingSummary,
      });

      // Schedule next run
      const intervalMs = SCHEDULE_MS[agent.schedule] ?? SCHEDULE_MS['24h'];
      await updateAgentSchedule(agent.id, {
        next_run_at: new Date(Date.now() + intervalMs).toISOString(),
        last_scheduled_run_at: new Date().toISOString(),
      });

      results.push({ agentId: agent.id, status: result.status });
    } catch (err) {
      // Create error report even on unexpected failure
      await createScheduledReport({
        agent_id: agent.id,
        test_run_id: null,
        status: 'error',
        summary: `Unexpected error: ${String(err).slice(0, 200)}`,
        steps: null,
        healing_summary: null,
      });

      // Still schedule next run so agent doesn't get stuck
      const intervalMs = SCHEDULE_MS[agent.schedule] ?? SCHEDULE_MS['24h'];
      await updateAgentSchedule(agent.id, {
        next_run_at: new Date(Date.now() + intervalMs).toISOString(),
        last_scheduled_run_at: new Date().toISOString(),
      });

      results.push({ agentId: agent.id, status: 'error', error: String(err) });
    }
  }

  return NextResponse.json({ ran: results.length, results });
}
