# Phase 5 — Exploration Frontend

Status: complete
Started: 2026-04-02
Completed: 2026-04-02

---

## Goal

Build the frontend UI for the exploration flow — a live screenshot viewer that streams exploration progress via SSE. The user clicks "Start Exploration" on a project page, sees screenshots stream in real-time as pages are discovered, and navigates to the chat page when exploration is complete. This is the first user-visible feature.

## Dependencies

- Phase 1 — project scaffold, shadcn/ui components (Button, Card, Badge, ScrollArea)
- Phase 3 — `lib/hooks/useSSE.ts` hook for consuming SSE streams
- Phase 4 — `POST /api/explore` SSE endpoint, exploration engine

## Context Manifest

> These are the skills, docs, and files `/start-phase` will load automatically.
> Edit this section if you want the agent to consult additional resources.

### Skills
- `git`
- `frontend-design`

### Docs to Fetch
- https://nextjs.org/docs/app/building-your-application/routing — App Router routing (server components, client components, dynamic routes)

### Project Files to Read
- `spec/architecture.md` — Section 8.1 (Exploration Viewer wireframe), Section 5 (POST /api/explore SSE events)
- `lib/types.ts` — `SSEEvent` union type (screenshot, page_summary, page_discovered, status, done, error)
- `lib/hooks/useSSE.ts` — `useSSE()` hook API (url, body, onEvent, start, stop)
- `components/ExplorationViewer.tsx` — current placeholder
- `app/projects/[id]/explore/page.tsx` — current placeholder
- `components/ui/` — available shadcn components (Button, Card, Badge, ScrollArea)
- `lib/supabase.ts` — `getProject()` for loading project data

## Pre-work Notes

> This section is for you to fill in before work begins.
> Add constraints, decisions already made, questions to resolve, patterns to follow, or anything the agent should know before touching code.

### Decisions already made
- **useSSE hook**: Uses `fetch` + `ReadableStream` (not EventSource). Returns `{ events, isStreaming, error, start, stop }`.
- **SSE events to handle**: `status`, `screenshot`, `page_summary`, `page_discovered`, `done`, `error`

---

## Subtasks

- [x] 1. Exploration page shell — create `app/projects/[id]/explore/page.tsx`. Server component that loads project from Supabase. Passes project data to client component `ExplorationViewer`. "Start Exploration" button triggers the SSE stream.
- [x] 2. ExplorationViewer component — create `components/ExplorationViewer.tsx`. Two-column layout: live screenshot (left), discovered pages list (right). Uses `useSSE` hook to connect to `POST /api/explore`.
- [x] 3. Live screenshot display — render the latest `screenshot` event as a base64 `<img>`. Smooth transition/fade when screenshot updates. Show loading skeleton before first screenshot arrives.
- [x] 4. Discovered pages sidebar — list each page as it's discovered (from `page_discovered` events). States per page: queued (circle), loading (spinner), done (checkmark). Update state as `screenshot` and `page_summary` events arrive for each URL. Show Claude's summary below each page entry.
- [x] 5. Status bar — show current status message from `status` events at the top. Progress indicator (e.g., "Exploring page 3 of ~6"). Show "Done — N pages discovered" when `done` event arrives.
- [x] 6. Post-exploration navigation — when exploration completes, show "Start Chat" button. Button navigates to `/projects/[id]/chat`. Also allow re-exploration (new "Re-Explore" button).

### Gate

Exploration page loads project data, "Start Exploration" button streams live screenshots and discovered pages via SSE, status bar shows progress, and "Start Chat" button appears on completion.

---

## Work Log

### Session 2026-04-02
Starting phase. Lite prime complete. Context manifest loaded.
Docs fetched: Next.js App Router routing (knowledge-based)
Skills loaded: git, frontend-design
Project files read: spec/architecture.md (§8.1, §5), lib/types.ts, lib/hooks/useSSE.ts, components/ExplorationViewer.tsx, app/projects/[id]/explore/page.tsx, components/ui/*, lib/supabase.ts

- Implemented `app/projects/[id]/explore/page.tsx` — server component loads project, passes to ExplorationViewer
- Implemented `components/ExplorationViewer.tsx` — full exploration UI:
  - Two-column layout: live screenshot (2/3) + discovered pages sidebar (1/3)
  - SSE event handling via `onEvent` callback for all event types
  - Page state tracking with Map<url, PageState> (queued/loading/done)
  - Status bar with spinner during streaming, checkmark when done, page count badge
  - Post-exploration: "Start Chat" + "Re-Explore" buttons
  - Error display for stream failures
  - Loading skeleton before first screenshot
- `npx tsc --noEmit` passes clean

All subtasks complete. Gate condition met. Ready for /complete-phase.

### Session 2026-04-02 — Completed
Phase validated by user. All gate conditions met.

---

## Files Created / Modified

- `app/projects/[id]/explore/page.tsx` — rewritten from placeholder
- `components/ExplorationViewer.tsx` — rewritten from placeholder

---

## Decisions Made

- **Page state tracking**: Uses `Map<string, PageState>` with three states: queued (discovered but not yet visited), loading (screenshot taken, waiting for summary), done (summary received)
- **Screenshot display**: Shows the most recent screenshot event globally (not per-page) for the "live" feel
- **Layout**: 2/3 + 1/3 grid on large screens, stacked on mobile
- **Icons**: lucide-react icons — Circle (queued), Loader2 (loading), CheckCircle2 (done)
- **Re-exploration**: Resets all state and calls `start()` again — no page reload needed
- **SSE body memoization**: `useMemo` on the body object to prevent unnecessary re-renders from `useSSE`

---

## Completion Summary

### What was built
- **Explore page** (`app/projects/[id]/explore/page.tsx`): Server component that loads project from Supabase and renders `ExplorationViewer`.
- **ExplorationViewer** (`components/ExplorationViewer.tsx`): Client component with two-column layout (live screenshot + discovered pages sidebar), SSE event handling, page state tracking (queued/loading/done), status bar with progress, and post-exploration navigation.

### Key decisions locked in
- Page state tracked via `Map<string, PageState>` with three states
- Global "current screenshot" shows latest screenshot event for live feel
- 2/3 + 1/3 grid layout on large screens, stacked on mobile
- lucide-react icons for page status (Circle, Loader2, CheckCircle2)
- `useMemo` on SSE body to prevent re-render loops
- Re-exploration resets all state in-place (no page reload)

### Files
- `app/projects/[id]/explore/page.tsx` — rewritten
- `components/ExplorationViewer.tsx` — rewritten

### Next phase should know
- ExplorationViewer navigates to `/projects/[id]/chat` on "Start Chat" click — Phase 7 (Chat Frontend) needs that page to exist
- The `useSSE` hook pattern (body memoization, onEvent callback) should be reused for chat and run results viewers
