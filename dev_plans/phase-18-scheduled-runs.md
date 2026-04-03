# Phase 18 — Scheduled Agent Runs (Cron)

## Goal

Users can schedule agents to run automatically on a recurring basis (every 24h, 48h, weekly). If a test fails, a report is generated and shown on the dashboard. No external infra (no Redis, no BullMQ) — use Next.js API routes + a lightweight scheduler.

## Architecture Decision

**Option A: External cron service (e.g. Vercel Cron, GitHub Actions, cron-job.org)**
- Pros: Reliable, no server needed, works on serverless
- Cons: External dependency, needs deployment config

**Option B: In-process node-cron**
- Pros: Zero infra, works locally, simple
- Cons: Dies when server restarts, not suitable for production at scale

**Option C: Database-driven scheduler with API endpoint**
- Pros: Persists across restarts, works anywhere, no external deps
- Cons: Needs a polling mechanism

**Decision: Option C (Database-driven) + Vercel Cron compatibility**

Store schedules in the DB. A single API endpoint `GET /api/cron/run-scheduled` checks for due agents and runs them. This endpoint can be called by:
- **Local dev**: A `setInterval` in a server-side module (starts on first request)
- **Production**: Vercel Cron (`vercel.json` config) or any external cron service hitting the endpoint
- **Manual**: User clicks "Run Now" on a scheduled agent

## Database Changes

```sql
-- Add scheduling fields to agents table
ALTER TABLE agents ADD COLUMN schedule text CHECK (schedule IN ('off', '1h', '6h', '12h', '24h', '48h', '7d'));
ALTER TABLE agents ADD COLUMN schedule_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE agents ADD COLUMN next_run_at timestamptz;
ALTER TABLE agents ADD COLUMN last_scheduled_run_at timestamptz;

-- Notification/report tracking
CREATE TABLE scheduled_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  test_run_id uuid REFERENCES test_runs(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('passed', 'failed', 'error')),
  summary text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_agents_next_run ON agents(next_run_at) WHERE schedule_enabled = true;
CREATE INDEX idx_reports_agent ON scheduled_reports(agent_id);
```

## API Endpoints

### `GET /api/cron/run-scheduled`

Called periodically (every 5 minutes by cron or setInterval). Logic:

```
1. Query agents WHERE schedule_enabled = true AND next_run_at <= now()
2. For each due agent:
   a. Run the test (same as POST /api/run but without SSE — just execute and collect results)
   b. Generate a summary report
   c. Save to scheduled_reports
   d. Update agent.next_run_at based on schedule interval
   e. Update agent.last_scheduled_run_at = now()
3. Return { ran: N, passed: X, failed: Y }
```

### `PATCH /api/agents/:id` (already exists)

Add support for updating schedule fields:
```json
{ "schedule": "24h", "schedule_enabled": true }
```

### `GET /api/agents/:id/reports`

Returns recent scheduled run reports for an agent.

## Runner Changes

Extract a `runTestHeadless()` function from the existing `runTest()` that:
- Doesn't use SSE (no streaming)
- Returns a structured result: `{ status, durationMs, steps, healingSummary }`
- Can be called from the cron endpoint without a client connection

The existing `runTest()` can wrap `runTestHeadless()` and add SSE streaming on top.

## Frontend Changes

### Runs Page — Schedule Controls

On each agent card, add a schedule section:

```
┌─ Mint USDC and Deposit to Vault ──────────────────────────┐
│  [Code] [Run] [Schedule ▾]                      [Delete]  │
│                                                            │
│  Schedule: Every 24 hours                                  │
│  Next run: in 18 hours (Apr 4, 2:00 AM)                   │
│  Last scheduled: Apr 3, 2:00 AM — Passed ✓                │
│                                                            │
│  [Reports (5)]                                             │
└────────────────────────────────────────────────────────────┘
```

**Schedule dropdown options:**
- Off (disabled)
- Every hour
- Every 6 hours
- Every 12 hours
- Every 24 hours
- Every 48 hours
- Every 7 days

### Reports View

A collapsible section showing recent scheduled run reports:
```
┌ Report — Apr 3, 2:00 AM ─── Passed ✓ ─── 26.5s ──────┐
│  ✓ Navigate to faucet and mint USDC          3.2s      │
│  ✓ Verify USDC balance >= 10,000             1.8s      │
│  ✓ Deposit 50 USDC and verify TVL            15.3s     │
└────────────────────────────────────────────────────────┘

┌ Report — Apr 2, 2:00 AM ─── Failed ✗ ─── 45.1s ──────┐
│  ✓ Navigate to faucet and mint USDC          3.2s      │
│  ✗ Verify USDC balance >= 10,000             30.0s     │
│    Error: Timeout — selector not found                  │
│  ⊘ Deposit 50 USDC (skipped)                           │
│                                                         │
│  Self-healed: Yes (attempt 2)                           │
└─────────────────────────────────────────────────────────┘
```

### Landing Page / Dashboard

Add a summary widget showing scheduled agent health:
```
┌─ Scheduled Agents ────────────────────┐
│  3 agents scheduled                   │
│  ✓ 2 passing   ✗ 1 failing           │
│  Next run: in 4 hours                 │
└───────────────────────────────────────┘
```

## Vercel Cron Config (Production)

```json
// vercel.json
{
  "crons": [{
    "path": "/api/cron/run-scheduled",
    "schedule": "*/5 * * * *"
  }]
}
```

## Local Dev Scheduler

For local development, start a background interval on first API request:

```typescript
// lib/scheduler.ts
let started = false;

export function ensureSchedulerStarted() {
  if (started) return;
  started = true;

  // Check every 5 minutes for due agents
  setInterval(async () => {
    try {
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/cron/run-scheduled`);
    } catch {
      // ignore
    }
  }, 5 * 60 * 1000);
}
```

## Security

The cron endpoint needs protection so random users can't trigger runs:

```typescript
// In the cron route handler
const authHeader = request.headers.get('authorization');
const cronSecret = process.env.CRON_SECRET;

// Allow if: no secret configured (local dev) OR secret matches OR Vercel cron header
if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
  const vercelCron = request.headers.get('x-vercel-cron');
  if (!vercelCron) {
    return new Response('Unauthorized', { status: 401 });
  }
}
```

## Subtasks

- [ ] Add schedule columns to agents table (migration)
- [ ] Create `scheduled_reports` table
- [ ] Extract `runTestHeadless()` from `runTest()`
- [ ] Create `GET /api/cron/run-scheduled` endpoint
- [ ] Create `GET /api/agents/:id/reports` endpoint
- [ ] Update `PATCH /api/agents/:id` to support schedule fields
- [ ] Add schedule dropdown UI to agent cards in RunResults
- [ ] Add reports view (collapsible per agent)
- [ ] Add dashboard summary widget on landing page
- [ ] Add local dev scheduler (setInterval)
- [ ] Add `vercel.json` cron config for production
- [ ] Add CRON_SECRET env var for endpoint protection
- [ ] Test: schedule agent → wait → verify it runs and generates report

## Files to Change

| File | Change |
|------|--------|
| `supabase/schema.sql` | Add schedule columns + scheduled_reports table |
| `lib/runner.ts` | Extract `runTestHeadless()` |
| `lib/supabase.ts` | CRUD for schedules + reports |
| `lib/types.ts` | Schedule types, ScheduledReport interface |
| `lib/scheduler.ts` (NEW) | Local dev scheduler |
| `app/api/cron/run-scheduled/route.ts` (NEW) | Cron endpoint |
| `app/api/agents/[id]/reports/route.ts` (NEW) | Reports endpoint |
| `app/api/agents/[id]/route.ts` | Accept schedule fields in PATCH |
| `components/RunResults.tsx` | Schedule controls + reports UI |
| `app/page.tsx` | Dashboard summary widget |
| `vercel.json` (NEW) | Cron config for production |
