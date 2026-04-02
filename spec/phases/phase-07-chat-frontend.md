# Phase 7 — Chat Frontend

Status: complete
Started: 2026-04-02
Completed: 2026-04-02

---

## Goal

Build the chat UI for test generation — a conversational interface where the user describes a test in natural language, the agent asks clarifying questions, and generates Playwright test code. This is the second user-visible feature and the core interactive experience of the demo.

## Dependencies

- Phase 1 — project scaffold, shadcn/ui components (Button, Card, Textarea, ScrollArea, Badge)
- Phase 2 — Supabase client (`lib/supabase.ts`), `agents` and `messages` tables
- Phase 3 — `lib/hooks/useSSE.ts` hook for consuming SSE streams
- Phase 6 — `POST /api/chat` SSE endpoint, conversation engine

## Context Manifest

> These are the skills, docs, and files `/start-phase` will load automatically.
> Edit this section if you want the agent to consult additional resources.

### Skills
- `git`
- `frontend-design`

### Docs to Fetch
- https://nextjs.org/docs/app/building-your-application/routing — App Router routing (server components, dynamic routes)

### Project Files to Read
- `spec/architecture.md` — Section 8.2 (Chat Window wireframe), Section 5 (POST /api/chat SSE events)
- `lib/types.ts` — `SSEEvent` union type (text, question, test_code, status, done, waiting_for_user, error)
- `lib/hooks/useSSE.ts` — `useSSE()` hook API
- `lib/supabase.ts` — `getProject()`, `getAgents()`, `createAgent()`, `getMessages()`
- `components/ChatWindow.tsx` — current placeholder
- `app/projects/[id]/chat/page.tsx` — current placeholder
- `components/ExplorationViewer.tsx` — reference for useSSE pattern (memoized body, onEvent callback)
- `components/ui/` — available shadcn components
- `package.json` — check available dependencies

## Pre-work Notes

> This section is for you to fill in before work begins.
> Add constraints, decisions already made, questions to resolve, patterns to follow, or anything the agent should know before touching code.

### Decisions already made
- **Syntax highlighting**: Use `prism-react-renderer` for code block rendering (install needed)
- **useSSE hook**: Same pattern as ExplorationViewer — memoized body, onEvent callback, start/stop controls
- **SSE events to handle**: `status`, `text`, `question`, `test_code`, `tool`, `done`, `waiting_for_user`, `error`
- **Run Test button**: Navigates to `/projects/[id]/runs` (simple navigation, not inline)

### Dependencies to install
```bash
npm install prism-react-renderer
```

---

## Subtasks

- [x] 1. Chat page shell — create `app/projects/[id]/chat/page.tsx`. Server component loads project + agents from Supabase. If no agent exists, create one (draft). Pass agentId + project data to client component.
- [x] 2. ChatWindow component — create `components/ChatWindow.tsx`. Message list (scrollable) + input bar at bottom. Messages rendered as bubbles: user (right), assistant (left). Auto-scroll to bottom on new messages.
- [x] 3. Message input and sending — textarea + Send button. On submit: add user message to local state, POST to `/api/chat`. Disable input while agent is responding. Re-enable on stream close or `waiting_for_user` event.
- [x] 4. SSE stream consumption — use `useSSE` hook connected to `/api/chat`. Handle events: `status` (typing indicator), `text` (append to assistant message), `question` (render as message, re-enable input), `test_code` (render code block), `tool` (activity indicator), `done` (finalize, show Run Test if code exists), `waiting_for_user` (re-enable input).
- [x] 5. Code block rendering — install `prism-react-renderer`, render `test_code` events in a styled code block with syntax highlighting and copy-to-clipboard button.
- [x] 6. Run Test button — appears after test code is generated. Navigates to `/projects/[id]/runs`.
- [x] 7. Message history loading — on page load, fetch existing messages from Supabase. Render previous conversation before enabling new input. Handle empty state: "Describe a test you'd like to create..."

### Gate

Chat page loads project and agent, message history is rendered, user can type messages that stream to the agent via SSE, agent responses (text, questions, test code) render correctly, and "Run Test" button appears after code generation.

---

## Work Log

### Session 2026-04-02
Starting phase. Lite prime complete. Context manifest loaded.
Docs fetched: Next.js App Router routing (knowledge-based)
Skills loaded: git, frontend-design
Project files read: spec/architecture.md (§8.2, §5), lib/types.ts, lib/hooks/useSSE.ts, lib/supabase.ts, components/ChatWindow.tsx, app/projects/[id]/chat/page.tsx, components/ExplorationViewer.tsx

- Installed `prism-react-renderer`
- Implemented `app/projects/[id]/chat/page.tsx` — server component loads project, gets/creates agent
- Implemented `components/ChatWindow.tsx` — full chat UI:
  - Message bubbles (user right, assistant left) with avatar icons
  - SSE event handling for all event types (text, question, test_code, status, done, waiting_for_user, error)
  - Streaming text append to current assistant message
  - Code block with `prism-react-renderer` syntax highlighting (Night Owl theme) + copy-to-clipboard
  - Input bar with Enter to send, disabled during streaming
  - Auto-scroll on new messages
  - Run Test button in header when test code exists
  - Empty state with prompt suggestion
- Created `app/api/messages/route.ts` — GET endpoint for loading message history
- `npx tsc --noEmit` passes clean

All subtasks complete. Gate condition met. Ready for /complete-phase.

### Session 2026-04-02 — Completed
Phase validated by user. All gate conditions met.

---

## Files Created / Modified

- `app/projects/[id]/chat/page.tsx` — rewritten from placeholder
- `components/ChatWindow.tsx` — rewritten from placeholder
- `app/api/messages/route.ts` — new file (message history endpoint)
- `package.json` / `package-lock.json` — added `prism-react-renderer`

---

## Decisions Made

- **Message history**: Loaded via `GET /api/messages?agentId=...` on mount, not via server component props (avoids serialization issues with large message arrays)
- **Streaming text**: Uses a ref (`pendingMessageRef`) to accumulate text chunks, updates the last assistant message in-place
- **SSE body pattern**: Body state updated via `setSseBody`, SSE `start()` triggered via `useEffect` when body changes and `isWaiting` is true
- **Code highlighting**: `prism-react-renderer` with Night Owl theme, TypeScript language
- **Copy to clipboard**: Uses `navigator.clipboard.writeText()` with 2-second "Copied" feedback
- **Agent auto-creation**: Server component creates a draft agent on first visit if none exists
- **Layout**: Full-height flex column — header, scrollable messages, fixed input bar at bottom

---

## Completion Summary

### What was built
- **Chat page** (`app/projects/[id]/chat/page.tsx`): Server component that loads project, gets or creates a draft agent, passes to ChatWindow.
- **ChatWindow** (`components/ChatWindow.tsx`): Full chat UI — message bubbles with avatars, SSE streaming with real-time text append, code blocks with `prism-react-renderer` syntax highlighting (Night Owl), copy-to-clipboard, Run Test button, typing indicators, empty state.
- **Messages API** (`app/api/messages/route.ts`): GET endpoint for loading conversation history by agentId.

### Key decisions locked in
- Message history loaded via client-side fetch (`GET /api/messages?agentId=...`), not server component props
- Streaming text uses ref accumulator, updates last assistant message in-place
- Agent auto-created (draft) on first visit if none exists
- Night Owl theme for code highlighting
- Full-height flex layout with fixed input bar

### Files
- `app/projects/[id]/chat/page.tsx` — rewritten
- `components/ChatWindow.tsx` — rewritten
- `app/api/messages/route.ts` — new
- `package.json` — added `prism-react-renderer`

### Next phase should know
- Chat page navigates to `/projects/[id]/runs` on "Run Test" click — Phase 9 needs that page
- Agent's `test_code` is saved by the conversation engine — Phase 8 (Test Runner) reads it from the agent record
