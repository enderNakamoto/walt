/**
 * Local development scheduler.
 * Polls the cron endpoint every 5 minutes to run scheduled agents.
 * In production, Vercel Cron handles this via vercel.json config.
 */
let started = false;

export function ensureSchedulerStarted() {
  if (started) return;
  started = true;

  // Check every 5 minutes for due agents
  setInterval(async () => {
    try {
      await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/cron/run-scheduled`,
      );
    } catch {
      // ignore — server may not be ready
    }
  }, 5 * 60 * 1000);
}
