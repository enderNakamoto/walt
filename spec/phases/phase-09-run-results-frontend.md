# Phase 9 — Run Results Frontend

Status: complete
Started: 2026-04-02
Completed: 2026-04-02

---

## Goal

Build the run results UI that shows step-by-step test execution progress with screenshots. The user clicks "Run Test", sees steps stream in live via SSE, views screenshots for each step, and can re-run or iterate on the test. Also shows run history from previous executions.

## Dependencies

- Phase 1 — shadcn/ui components (Button, Card, Badge, ScrollArea)
- Phase 2 — Supabase client (`lib/supabase.ts`), `test_runs` and `test_run_steps` tables
- Phase 3 — `lib/hooks/useSSE.ts` hook
- Phase 8 — `POST /api/run` SSE endpoint, test runner

## Context Manifest

> These are the skills, docs, and files `/start-phase` will load automatically.
> Edit this section if you want the agent to consult additional resources.

### Skills
- `git`
- `frontend-design`

### Docs to Fetch
- https://nextjs.org/docs/app/building-your-application/routing — App Router routing

### Project Files to Read
- `spec/architecture.md` — Section 8.3 (Run Results wireframe), Section 5 (POST /api/run SSE events)
- `lib/types.ts` — `SSEEvent` (step, done, status, error), `TestRun`, `TestRunStep`
- `lib/hooks/useSSE.ts` — `useSSE()` hook API
- `lib/supabase.ts` — `getAgent()`, `getTestRuns()`, `getTestRunSteps()`, `getProject()`, `getAgents()`
- `components/RunResults.tsx` — current placeholder
- `app/projects/[id]/runs/page.tsx` — current placeholder
- `components/ExplorationViewer.tsx` — reference for useSSE pattern
- `components/ui/` — available shadcn components

## Pre-work Notes

> This section is for you to fill in before work begins.

### Decisions already made
- **useSSE hook**: Same pattern as ExplorationViewer/ChatWindow — memoized body, onEvent callback
- **SSE events to handle**: `status`, `step` (index, name, status, durationMs, error, screenshot), `done` (status, durationMs), `error`
- **Screenshot viewer**: Click to expand in a simple modal/dialog
- **Run Test**: POST `{ agentId }` to `/api/run`

---

## Subtasks

- [x] 1. Runs page shell — create `app/projects/[id]/runs/page.tsx`. Server component loads project + agent + recent test runs from Supabase. List previous runs with status badges. "Run Test" button at top.
- [x] 2. RunResults component — create `components/RunResults.tsx`. Shows step-by-step progress of a test run. Each step: name, status badge, duration, screenshot thumbnail, error message.
- [x] 3. Live run streaming — when "Run Test" clicked, POST to `/api/run`, consume SSE stream. Show steps appearing one-by-one. Overall progress at top. Final summary on done event.
- [x] 4. Screenshot viewer — click step screenshot to view full-size in modal. For failed steps: highlight error message, show failure screenshot.
- [x] 5. Run history list — below current run, show previous runs. Each run: timestamp, status badge, duration, expandable steps. Load from test_runs + test_run_steps.
- [x] 6. Re-run and iterate — "Re-run" button, "Edit Test" link back to chat, "View Code" expandable.

### Gate

Runs page loads test history, "Run Test" button streams live step results via SSE with screenshots, failed steps show error messages, previous runs are listed, and navigation back to chat works.

---

## Work Log

### Session 2026-04-02
Starting phase. Context loaded.

- Implemented `app/projects/[id]/runs/page.tsx` — server component loads project, agent, test runs
- Implemented `components/RunResults.tsx` — full run results UI:
  - Live SSE streaming of step events with screenshots
  - Step cards with status icons, duration, error messages
  - Screenshot modal on click (overlay with dismiss)
  - Failed steps highlighted with red border/background
  - Run history list with expandable steps (lazy-loaded)
  - StatusBadge component (passed/failed/error/running)
  - "Run Test", "Re-run", "Edit Test" buttons
  - Empty states for no agent and no test code
- Created `app/api/test-runs/[id]/steps/route.ts` — GET endpoint for loading steps by run ID
- `npx tsc --noEmit` passes clean

All subtasks complete. Gate condition met. Ready for /complete-phase.

### Session 2026-04-02 — Completed
Phase validated by user. All gate conditions met.

---

## Files Created / Modified

- `app/projects/[id]/runs/page.tsx` — rewritten from placeholder
- `components/RunResults.tsx` — rewritten from placeholder
- `app/api/test-runs/[id]/steps/route.ts` — new file

---

## Decisions Made

- **Run history steps**: Lazy-loaded via `GET /api/test-runs/[id]/steps` on expand click, cached in component state
- **Screenshot modal**: Simple overlay div with fixed positioning, click-to-dismiss
- **Failed step highlighting**: Red border + background via conditional Tailwind classes
- **Run history from server**: Initial runs loaded by server component and passed as props
- **Current run vs history**: Current run shown at top in its own card, history below in expandable list

---

## Completion Summary

### What was built
- **Runs page** (`app/projects/[id]/runs/page.tsx`): Server component loading project, agent, and test run history.
- **RunResults** (`components/RunResults.tsx`): Full run results UI — live SSE step streaming with screenshots, step cards with status/duration/error, screenshot modal, run history with expandable steps, status badges, navigation buttons.
- **Steps API** (`app/api/test-runs/[id]/steps/route.ts`): GET endpoint for lazy-loading step details by run ID.

### Key decisions locked in
- Run history steps lazy-loaded on expand click, cached in component state
- Screenshot modal via fixed overlay with click-to-dismiss
- Failed steps highlighted with red border/background
- Initial runs loaded server-side, current run streamed client-side

### Files
- `app/projects/[id]/runs/page.tsx` — rewritten
- `components/RunResults.tsx` — rewritten
- `app/api/test-runs/[id]/steps/route.ts` — new

### Next phase should know
- All three core flows are complete (explore → chat → run)
- Phase 10 needs the landing page, project CRUD, and navigation to tie them together
