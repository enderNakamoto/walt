# Phase 16 — Rich Test Results

## Goal

Capture comprehensive data during test execution — screenshots at every action, console logs, network failures, DOM snapshots — so users can understand exactly what happened during a test run without re-running it.

## Current Problem

Current results include:
- One screenshot per test spec (at end, or on failure)
- Step name and pass/fail status
- Error message text
- Duration

Missing: intermediate screenshots, console output, network errors, what the page looked like at each step, trace file access.

## What Changes

### 1. Action-Level Screenshots

Instead of one screenshot per spec, capture a screenshot **after every significant action**:
- After each `page.goto()` — "navigated to /vault"
- After each `click()` — "clicked Deposit button"
- After each `fill()` — "filled amount with 50"
- After each assertion — "verified TVL shows $4,562.00"
- On any error — "failed at assertion"

This requires **wrapping the test code** with instrumentation before execution. The runner will inject a Playwright fixture that intercepts page actions and captures screenshots.

### 2. Console Log Capture

Collect all `console.log`, `console.error`, `console.warn` during the test:

```typescript
const consoleLogs: Array<{ type: string; text: string; timestamp: number }> = [];
page.on('console', msg => {
  consoleLogs.push({
    type: msg.type(),
    text: msg.text(),
    timestamp: Date.now(),
  });
});
```

Store in `test_run_steps` or a new `test_run_logs` table.

### 3. Network Failure Tracking

Capture failed network requests (4xx, 5xx, timeouts):

```typescript
const networkErrors: Array<{ url: string; status: number; method: string }> = [];
page.on('requestfailed', request => {
  networkErrors.push({
    url: request.url(),
    status: 0,
    method: request.method(),
  });
});
page.on('response', response => {
  if (response.status() >= 400) {
    networkErrors.push({
      url: response.url(),
      status: response.status(),
      method: response.request().method(),
    });
  }
});
```

### 4. DOM Snapshot on Error

When a step fails, capture the page's DOM state:
- Visible text content
- Interactive elements and their states (disabled, hidden, etc.)
- The element the test was trying to interact with (or couldn't find)

### 5. Trace File Links

Playwright's `trace: "on"` captures a full execution trace that can be viewed in Playwright's trace viewer. Store the trace zip in Supabase Storage and provide a link.

### 6. Enhanced Results UI

Update RunResults to show:
- Thumbnail timeline of screenshots (click to expand)
- Console log panel (collapsible, filtered by error/warn/log)
- Network errors panel
- DOM snapshot viewer on error steps
- "View Trace" button that opens Playwright trace viewer

### 7. Database Changes

```sql
-- New columns on test_run_steps
ALTER TABLE test_run_steps ADD COLUMN action_type text;  -- 'navigate', 'click', 'fill', 'assert', 'error'
ALTER TABLE test_run_steps ADD COLUMN dom_snapshot jsonb;
ALTER TABLE test_run_steps ADD COLUMN console_logs jsonb;

-- New table for network errors per run
CREATE TABLE test_run_network_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_run_id uuid NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
  url text NOT NULL,
  method text NOT NULL,
  status integer,
  error text,
  timestamp timestamptz NOT NULL DEFAULT now()
);

-- Trace file path on test_runs
ALTER TABLE test_runs ADD COLUMN trace_path text;
```

## Files to Change

| File | Change |
|------|--------|
| `lib/runner.ts` | Add instrumentation fixture, console/network capture, per-action screenshots |
| `lib/types.ts` | Enhanced `TestRunStep` with action_type, dom_snapshot, console_logs |
| `lib/supabase.ts` | New CRUD for network logs, updated step creation |
| `supabase/schema.sql` | Schema additions |
| `components/RunResults.tsx` | Screenshot timeline, console panel, network panel, trace link |
| `app/api/test-runs/[id]/steps/route.ts` | Return enriched step data |

## Subtasks

- [ ] Design instrumentation approach (Playwright fixture vs code wrapping)
- [ ] Implement console log capture in runner
- [ ] Implement network error capture in runner
- [ ] Implement per-action screenshot capture
- [ ] Capture DOM snapshot on failure
- [ ] Store trace files in Supabase Storage
- [ ] Update schema with new columns/tables
- [ ] Update RunResults UI — screenshot timeline
- [ ] Update RunResults UI — console log panel
- [ ] Update RunResults UI — network error panel
- [ ] Add "View Trace" button
- [ ] Test with multi-step test scenario
