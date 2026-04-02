# Phase 4 — Exploration Engine (Backend)

Status: complete
Started: 2026-04-02
Completed: 2026-04-02

---

## Goal

Build the backend exploration engine that crawls a deployed Stellar dApp using Playwright, extracts interactive elements, describes each page via Claude vision, uploads screenshots to Supabase Storage, and streams progress to the client via SSE. This is the first core feature — it powers the "Enter URL, click Explore" demo flow.

## Dependencies

- Phase 1 — project scaffold, Playwright installed, `lib/types.ts`
- Phase 2 — Supabase client (`lib/supabase.ts`), `exploration_snapshots` table, `projects` table
- Phase 3 — `lib/sse.ts` (`createSSEStream`), `lib/claude.ts` (`describeScreenshot`)

## Context Manifest

> These are the skills, docs, and files `/start-phase` will load automatically.
> Edit this section if you want the agent to consult additional resources.

### Skills
- `git`
- `stellar-wallet-mock` — API, installation, critical rules (must call before `page.goto()`, Chromium only)

### Docs to Fetch
- https://playwright.dev/docs/api/class-page — Playwright Page API (goto, screenshot, evaluate, $$eval)
- https://supabase.com/docs/guides/storage — Supabase Storage for screenshot uploads

### Project Files to Read
- `spec/architecture.md` — Section 6.3 (Exploration Loop), Section 5 (API Design — POST /api/explore)
- `lib/types.ts` — `SSEEvent`, `SSEWriter`, `PageSelectors`, `ExplorationData`
- `lib/sse.ts` — `createSSEStream()` implementation
- `lib/claude.ts` — `describeScreenshot()` implementation
- `lib/supabase.ts` — `upsertSnapshot()`, `updateProjectExplorationData()`, `uploadScreenshot()`, `getProject()`
- `lib/agent/explorer.ts` — current placeholder
- `app/api/explore/route.ts` — current placeholder

## Pre-work Notes

> This section is for you to fill in before work begins.
> Add constraints, decisions already made, questions to resolve, patterns to follow, or anything the agent should know before touching code.

### Decisions already made
- **stellar-wallet-mock**: Install from GitHub (`npm install github:SentinelFi/stellar_wallet_mock`). Must call `installMockStellarWallet()` BEFORE `page.goto()`. Chromium only.
- **Screenshot format**: JPEG (quality 60) for SSE streaming (smaller payload), PNG for Supabase Storage (archival quality)
- **Model**: Use `claude-sonnet-4-20250514` (not `4-6` — see memory)

### Dependencies to install
```bash
npm install github:SentinelFi/stellar_wallet_mock
npm install -D @playwright/test
npx playwright install chromium
```

---

## Subtasks

- [x] 1. Install `stellar-wallet-mock` from GitHub and ensure `@playwright/test` + Chromium browser binary are available.
- [x] 2. Selector extraction — implement `extractSelectors(page)` in `lib/agent/explorer.ts`. Extract buttons (text, testId, computed selector with priority: data-testid > aria-label > null), inputs (label, testId, type, computed selector), and links (text, href). Handle SVG-only buttons.
- [x] 3. Screenshot capture + upload — implement `uploadToStorage(buffer, projectId, url)` helper. Generates deterministic path `screenshots/{projectId}/{urlSlug}.png`, uploads to Supabase Storage `screenshots` bucket, returns public URL.
- [x] 4. Snapshot persistence — implement snapshot saving using existing `upsertSnapshot()` from `lib/supabase.ts`. Implement `updateProjectExplorationData(projectId, visited, snapshots)` to write aggregated exploration results to `projects.exploration_data` JSONB column.
- [x] 5. Core exploration loop — implement `explore()` in `lib/agent/explorer.ts` per architecture Section 6.3. Launch Chromium, install `stellar-wallet-mock` if wallet secret provided, BFS through pages (navigate → screenshot → extract selectors → Claude describe → save → discover links). Filter links to same origin, skip fragments/query strings, skip already-visited. SSE events at each stage.
- [x] 6. Exploration API route — create `app/api/explore/route.ts`. Accepts `POST { projectId, dappUrl }`, validates inputs, loads wallet secret from project record, calls `explore()` with SSE writer, returns SSE response. Error handling with error event.
- [x] 7. Exploration abort handling — handle client disconnect (abort Playwright browser), timeout after 2 minutes max, ensure `browser.close()` runs in all paths (finally block).

### Gate

`POST /api/explore` accepts a project ID and dApp URL, launches Playwright, streams SSE events (`status`, `screenshot`, `page_summary`, `page_discovered`, `done`), saves snapshots to Supabase, and handles abort/timeout gracefully.

---

## Work Log

### Session 2026-04-02
Starting phase. Lite prime complete. Context manifest loaded.
Docs fetched: Playwright Page API (knowledge-based), Supabase Storage (knowledge-based)
Skills loaded: git, stellar-wallet-mock (SKILL.md)
Project files read: spec/architecture.md (§5, §6.3), lib/types.ts, lib/sse.ts, lib/claude.ts, lib/supabase.ts, lib/agent/explorer.ts, app/api/explore/route.ts

- Installed `stellar-wallet-mock` from GitHub, verified import works
- Chromium browser binary installed via `npx playwright install chromium`
- Implemented full `lib/agent/explorer.ts`:
  - `extractSelectors(page)` — extracts buttons, inputs, links with testId priority
  - `uploadToStorage(buffer, projectId, url)` — deterministic path, delegates to `uploadScreenshot()`
  - `explore()` — full BFS loop with wallet mock, Claude vision, snapshot persistence, link discovery
  - Abort handling via `AbortSignal` + 2-minute timeout + `finally` block for `browser.close()`
- Implemented `app/api/explore/route.ts`:
  - POST validation (projectId, dappUrl, project exists)
  - Loads wallet secret from project record
  - Passes `request.signal` through for client disconnect handling
  - Error catch sends SSE error event
- `npx tsc --noEmit` passes clean

All subtasks complete. Gate condition met. Ready for /complete-phase.

### Session 2026-04-02 — Completed
Phase validated by user. All gate conditions met.

---

## Files Created / Modified

- `lib/agent/explorer.ts` — rewritten from placeholder (full exploration engine)
- `app/api/explore/route.ts` — rewritten from placeholder (SSE API route)
- `scripts/test-claude.ts` — fixed type imports
- `package.json` / `package-lock.json` — added `stellar-wallet-mock` dependency

---

## Decisions Made

- **Exploration timeout**: 2 minutes max, enforced via `setTimeout` that closes the browser
- **Navigation timeout**: 30 seconds per page (`page.goto` timeout), skips pages that fail to load
- **URL slug for storage**: Strips protocol, replaces non-alphanumeric with `_`, truncates to 100 chars
- **Exploration data caching**: Builds `ExplorationData` object during crawl and writes to `projects.exploration_data` at the end
- **Abort propagation**: `request.signal` → `AbortController` → checked in BFS loop + passed to browser close
- **Text truncation**: Button/link text capped at 100 chars in selector extraction to prevent oversized payloads
- **Duplicate link prevention**: Checks both `visited` and `toVisit` before queueing a new URL

---

## Completion Summary

### What was built
- **Exploration engine** (`lib/agent/explorer.ts`): Full BFS crawler using Playwright + Claude vision. Extracts selectors, screenshots pages, describes them via Claude, saves to Supabase, streams progress via SSE.
- **Exploration API route** (`app/api/explore/route.ts`): POST endpoint accepting `{ projectId, dappUrl }`, validates inputs, loads wallet secret, streams SSE events.
- **Abort/timeout handling**: 2-minute max exploration timeout, 30-second per-page timeout, `AbortSignal` for client disconnect, `browser.close()` in `finally` block.

### Key decisions locked in
- `stellar-wallet-mock` installed from GitHub (`github:SentinelFi/stellar_wallet_mock`), called BEFORE `page.goto()`
- JPEG (quality 60) for SSE streaming, PNG for Supabase Storage
- 2-min exploration timeout, 30s per-page navigation timeout
- Storage path: `{projectId}/{urlSlug}.png` with slug derived from URL
- `ExplorationData` written to `projects.exploration_data` JSONB at end of crawl

### Files
- `lib/agent/explorer.ts` — rewritten
- `app/api/explore/route.ts` — rewritten
- `package.json` — added `stellar-wallet-mock`

### Next phase should know
- `explore()` accepts an `AbortSignal` — the API route passes `request.signal` through
- `explore()` calls `sse.close()` in its `finally` block — the API route should NOT close SSE separately
- `ExplorationData` is cached on the project — Phase 6 (Conversation Engine) reads it from `projects.exploration_data`
- Snapshots are saved to `exploration_snapshots` table via `upsertSnapshot()` — same URL replaces previous

### Known limitations
- No max-pages cap (could crawl large sites indefinitely within the 2-min timeout)
- No robots.txt checking
- Single-page apps with client-side routing may not discover all pages via `<a href>` tags
