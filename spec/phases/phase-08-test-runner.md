# Phase 8 — Test Runner (Backend)

Status: complete
Started: 2026-04-02
Completed: 2026-04-02

---

## Goal

Build the local Playwright test runner that executes generated test code in an isolated temp directory, streams step-by-step results via SSE, and persists run records to Supabase. This completes the backend triad (explore → chat → run).

## Dependencies

- Phase 2 — Supabase client (`lib/supabase.ts`), `test_runs` and `test_run_steps` tables
- Phase 3 — `lib/sse.ts` (`createSSEStream`)
- Phase 6 — agent's `test_code` saved by conversation engine

## Subtasks

- [x] 1. Runner core — implement `runTest()` in `lib/runner.ts`. Create temp dir, write test file, playwright config, package.json. Set env vars.
- [x] 2. Dependency installation — run `npm install` in temp dir. SSE status event. Handle install failure.
- [x] 3. Test execution — run `npx playwright test --reporter=json`. Capture output. Parse results.json.
- [x] 4. Result parsing and streaming — walk results.json structure, emit step events with screenshots. Emit done event.
- [x] 5. Result persistence — create test_runs record, insert test_run_steps, upload screenshots, update final status.
- [x] 6. Run API route — create `app/api/run/route.ts`. POST { agentId }, load agent + project, validate, call runTest() with SSE.
- [x] 7. Cleanup and safety — finally block rm -rf temp dir, 120s timeout, handle concurrent runs.

### Gate

`POST /api/run` accepts an agent ID, executes the generated test in an isolated temp dir, streams step-by-step results via SSE, persists run records, and cleans up.

---

## Work Log

### Session 2026-04-02
Starting phase. Context loaded from architecture §7, dev_steps §8, lib/runner.ts placeholder, app/api/run/route.ts placeholder, lib/supabase.ts (test run CRUD).

- Implemented `lib/runner.ts` — full test runner:
  - Creates isolated temp dir `/tmp/stellar-test-{uuid}`
  - Writes test file, playwright config (baseURL, screenshot: on, JSON reporter), package.json
  - Installs deps + Chromium browser in temp dir
  - Runs `npx playwright test --reporter=json` with env vars (WALLET_SECRET_KEY, DAPP_URL)
  - Parses results.json, streams step events with screenshots
  - Persists test_runs + test_run_steps to Supabase
  - Uploads step screenshots to Supabase Storage
  - 120s timeout via exec timeout option
  - `rm -rf` temp dir in finally block
  - `sse.close()` in finally block
- Implemented `app/api/run/route.ts` — POST { agentId }, validates agent has test_code, loads project, calls runTest()
- `npx tsc --noEmit` passes clean

All subtasks complete. Gate condition met. Ready for /complete-phase.

### Session 2026-04-02 — Completed
Phase validated by user. All gate conditions met.

---

## Files Created / Modified

- `lib/runner.ts` — rewritten from placeholder
- `app/api/run/route.ts` — rewritten from placeholder

---

## Decisions Made

- **stellar-wallet-mock in temp project**: Installed from `github:SentinelFi/stellar_wallet_mock` (same as main project)
- **Chromium install**: Runs `npx playwright install chromium` in temp dir to ensure browser binary is available
- **Test failure handling**: Playwright exits non-zero on test failures — catch is expected, still parse results.json
- **Missing results.json**: If no results.json produced, report as "error" status (test crashed before producing output)
- **Screenshot upload**: Best-effort — failure to upload is non-critical, step still recorded
- **Timeout**: 120s via exec timeout option, 60s for npm install and Chromium install separately

---

## Completion Summary

### What was built
- **Test runner** (`lib/runner.ts`): Executes generated Playwright tests in isolated `/tmp/stellar-test-{uuid}` dirs. Installs deps + Chromium, runs with JSON reporter, parses results, streams step-by-step SSE events, persists test_runs and test_run_steps to Supabase, uploads screenshots.
- **Run API route** (`app/api/run/route.ts`): POST endpoint accepting `{ agentId }`, validates agent has test_code, loads project, calls `runTest()`.

### Key decisions locked in
- `stellar-wallet-mock` installed from GitHub in temp project (matches main project)
- Chromium installed per temp dir via `npx playwright install chromium`
- 120s exec timeout, 60s for npm install separately
- Missing `results.json` → "error" status (test crashed)
- Screenshot upload is best-effort (non-critical failure)
- `sse.close()` and `rm -rf` in `finally` block

### Files
- `lib/runner.ts` — rewritten
- `app/api/run/route.ts` — rewritten

### Next phase should know
- Run API accepts `POST { agentId }` — Phase 9 (Run Results Frontend) POSTs this
- SSE events: `status`, `step` (with index, name, status, screenshot, error), `done` (with status, durationMs)
- Test run records in `test_runs` table with `test_run_steps` — can be loaded for history display
