# Phase 15 — Self-Healing Runner

## Goal

When a test fails, the runner should **automatically diagnose and fix** the test by sending the failure screenshot + error message + DOM state to Claude, getting a corrected version, and retrying — up to 3 attempts.

## Current Problem

When a test fails:
1. The runner reports the error and stops
2. The user has to go back to chat, describe the problem, and regenerate
3. The agent has no idea what went wrong — it didn't see the failure
4. Common failures (selector miss, timing, stale value) could be auto-fixed

## What Changes

### 1. Self-Healing Loop in Runner

```
Run test
  ├── PASS → done ✓
  └── FAIL → capture error + screenshot + DOM
        ├── Send to Claude: "This test failed. Here's what happened. Fix it."
        ├── Claude returns fixed test code
        ├── Run fixed test (attempt 2)
        │   ├── PASS → done ✓ (healed)
        │   └── FAIL → capture again
        │         ├── Send to Claude with BOTH previous errors
        │         ├── Claude returns another fix
        │         ├── Run again (attempt 3)
        │         │   ├── PASS → done ✓ (healed)
        │         │   └── FAIL → give up, report all 3 attempts
        │         ...
```

### 2. Failure Diagnosis Prompt

```
You are a Playwright test debugger. A test failed with the following error.

## Test Code
{testCode}

## Error
{errorMessage}

## Failure Screenshot
[image attached]

## Page DOM State at Failure
{domSnapshot}

## Previous Attempts (if any)
{previousAttempts}

## Task
1. Analyze why the test failed
2. Look at the screenshot to understand what the page actually shows
3. Fix the test code — adjust selectors, waits, assertions to match reality
4. Return ONLY the complete fixed test code, no explanation

Common issues to check:
- Selector doesn't match actual text (check screenshot for exact wording)
- Element not visible yet (add proper wait)
- Value format mismatch (e.g. "$4,512.00 USDC" vs "4512")
- Element rendered in a different location than expected
- Transaction still pending when assertion runs
- React re-render changed the DOM between action and assertion
```

### 3. DOM Snapshot on Failure

When a test fails, before sending to Claude, capture:
```typescript
{
  url: page.url(),
  visibleText: await extractVisibleText(page),
  interactiveElements: await extractElements(page),
  consoleErrors: collectedConsoleErrors,
  failedNetworkRequests: collectedFailedRequests,
}
```

This requires the test runner to use Playwright's **programmatic API** for the healing attempts (not CLI), so we can capture page state on failure.

### 4. SSE Events for Healing

Stream the healing process to the frontend:
```
data: {"type": "step", "index": 0, "name": "...", "status": "failed", "error": "..."}
data: {"type": "healing", "attempt": 1, "diagnosis": "Selector 'text=Your USDC Balance:' doesn't match. Page shows 'Your USDC Balance:  19,380.00 USDC' as one text node. Fixing to use a more flexible locator."}
data: {"type": "status", "message": "Re-running with fixed test (attempt 2 of 3)..."}
data: {"type": "step", "index": 0, "name": "...", "status": "passed"}
data: {"type": "done", "status": "passed", "healed": true, "attempts": 2}
```

### 5. Save Healed Code

If healing succeeds, update the agent's `test_code` with the fixed version so future runs use the corrected selectors.

### 6. Healing History

Store each healing attempt in a new `healing_attempts` table:
```sql
CREATE TABLE healing_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_run_id uuid NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
  attempt_number integer NOT NULL,
  original_error text NOT NULL,
  diagnosis text,
  fixed_code text NOT NULL,
  result text NOT NULL CHECK (result IN ('passed', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
```

## Files to Change

| File | Change |
|------|--------|
| `lib/runner.ts` | Add healing loop: on failure → diagnose → fix → retry |
| `lib/claude.ts` | Add `diagnoseTestFailure()` function |
| `lib/agent/prompts.ts` | Add healing diagnosis prompt |
| `lib/types.ts` | Add `HealingAttempt`, `HealingSSEEvent` types |
| `lib/supabase.ts` | Add `createHealingAttempt()`, CRUD for healing_attempts |
| `supabase/schema.sql` | Add `healing_attempts` table |
| `components/RunResults.tsx` | Show healing attempts in UI |

## Subtasks

- [ ] Design healing loop flow (max 3 attempts, diminishing timeout)
- [ ] Implement `diagnoseTestFailure()` in claude.ts
- [ ] Write healing diagnosis prompt
- [ ] Capture DOM snapshot on test failure (requires programmatic Playwright for retry)
- [ ] Implement healing loop in runner (run → fail → diagnose → fix → retry)
- [ ] Add SSE events for healing progress
- [ ] Save healed code back to agent record
- [ ] Create `healing_attempts` table and CRUD
- [ ] Update RunResults UI to show healing attempts
- [ ] Test: a test with a bad selector should auto-heal
