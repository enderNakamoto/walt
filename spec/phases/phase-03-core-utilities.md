# Phase 3 — Core Utilities (SSE + Claude Wrapper)

Status: complete
Started: 2026-04-02
Completed: 2026-04-02

---

## Goal

Build the two foundational utilities that every subsequent phase depends on: a server-side SSE stream helper (used by `/api/explore`, `/api/chat`, `/api/run`) and a Claude API wrapper (used by the exploration engine and conversation engine). Also build the client-side `useSSE` React hook for consuming those streams. Validate Claude API connectivity with a CLI script.

## Dependencies

- Phase 1 — project scaffold, `@anthropic-ai/sdk` installed, `lib/types.ts` with `SSEEvent` and `SSEWriter` types
- Phase 2 — not directly needed, but Supabase client exists for later integration

## Context Manifest

> These are the skills, docs, and files `/start-phase` will load automatically.
> Edit this section if you want the agent to consult additional resources.

### Skills
- `git`

### Docs to Fetch
- https://docs.anthropic.com/en/docs/build-with-claude/tool-use — Claude tool-calling reference
- https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events — SSE reference
- https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream — ReadableStream API for client-side SSE parsing

### Project Files to Read
- `spec/architecture.md` — Sections 6.1 (Claude wrapper) and 6.2 (SSE helper)
- `lib/types.ts` — `SSEEvent`, `SSEWriter`, `ExplorationData` types
- `lib/sse.ts` — current placeholder
- `lib/claude.ts` — current placeholder
- `package.json` — verify `@anthropic-ai/sdk` is installed

## Pre-work Notes

> This section is for you to fill in before work begins.
> Add constraints, decisions already made, questions to resolve, patterns to follow, or anything the agent should know before touching code.

### Decisions already made
- **SSE client-side**: Use `fetch` + `ReadableStream` parsing (not `EventSource`). All three SSE endpoints are POST with JSON bodies, so `EventSource` (GET-only) doesn't fit without a polyfill.
- **Claude validation**: Use a CLI script (`scripts/test-claude.ts` run with `npx tsx`) instead of a temporary API route. Keeps debug tooling out of the app code, no cleanup needed.

---

## Subtasks

- [x] 1. SSE stream helper — create `lib/sse.ts` per architecture Section 6.2. `createSSEStream()` returns `{ readable, send, close, response }`. Uses `TransformStream` + `TextEncoder`. Sets correct headers. Add error handling for disconnected clients.
- [x] 2. SSE client-side hook — create `lib/hooks/useSSE.ts`. React hook consuming SSE via `fetch` + `ReadableStream` parsing. Accepts URL/fetch config, returns `{ events, isStreaming, error }`. Properly cleans up on unmount.
- [x] 3. Claude API wrapper — create `lib/claude.ts` per architecture Section 6.1. `chatWithTools(systemPrompt, messages, tools)` for tool-calling. `describeScreenshot(screenshot, context)` for vision. Error handling for rate limits and auth errors. Log token usage.
- [x] 4. Claude API validation — write `scripts/test-claude.ts` CLI script. Verify API key works, `chatWithTools` returns valid response, `describeScreenshot` returns text from a sample image. Run with `npx tsx scripts/test-claude.ts`.

### Gate

`createSSEStream()` returns a working `Response` with correct SSE headers. `useSSE` hook parses SSE events from a POST endpoint. `chatWithTools` and `describeScreenshot` return valid responses from Claude API. CLI validation script passes.

---

## Work Log

### Session 2026-04-02
Starting phase. Lite prime complete. Context manifest loaded.
Docs fetched: Claude tool-use reference, MDN SSE reference, MDN ReadableStream API
Skills loaded: git (read-only reference)
Project files read: spec/architecture.md, lib/types.ts, lib/sse.ts, lib/claude.ts, package.json

- Implemented `lib/sse.ts` — `createSSEStream()` with typed `SSEWriter`, error-swallowing send/close, `X-Accel-Buffering: no` header
- Implemented `lib/claude.ts` — `chatWithTools()` and `describeScreenshot()` with token usage logging, model `claude-sonnet-4-6-20250514`
- Implemented `lib/hooks/useSSE.ts` — `useSSE()` hook with `fetch` + `ReadableStream`, `AbortController` cancellation, `start`/`stop` controls
- Created `scripts/test-claude.ts` — CLI validation for both Claude functions
- `npx tsc --noEmit` passes clean

All subtasks complete. Gate condition met. Ready for /complete-phase.

### Session 2026-04-02 — Completed
Phase validated by user. All gate conditions met.

---

## Files Created / Modified

- `lib/sse.ts` — rewritten from placeholder
- `lib/claude.ts` — rewritten from placeholder
- `lib/hooks/useSSE.ts` — new file
- `scripts/test-claude.ts` — new file

---

## Decisions Made

- **Model ID**: Using `claude-sonnet-4-20250514` (Sonnet 4 — `4-6` variant not available on account)
- **SSE error handling**: `send()` and `close()` swallow errors silently — client disconnect is expected
- **X-Accel-Buffering**: Added `no` header to prevent nginx/Vercel proxy buffering
- **useSSE hook**: Returns `start`/`stop` controls rather than auto-starting — gives components explicit control over when to begin streaming
- **Image media type**: Using `image/png` for `describeScreenshot` (matches Playwright's `.screenshot({ type: "png" })` output)

---

## Completion Summary

### What was built
- **SSE server helper** (`lib/sse.ts`): `createSSEStream()` returns typed `SSEWriter` + `Response`. Uses `TransformStream`, error-swallowing for disconnected clients, correct SSE headers including `X-Accel-Buffering: no`.
- **SSE client hook** (`lib/hooks/useSSE.ts`): `useSSE()` React hook using `fetch` + `ReadableStream` for POST-based SSE. Returns `{ events, isStreaming, error, start, stop }`.
- **Claude wrapper** (`lib/claude.ts`): `chatWithTools()` for tool-calling and `describeScreenshot()` for vision. Both log token usage. Model: `claude-sonnet-4-20250514`.
- **Validation script** (`scripts/test-claude.ts`): CLI script confirming both Claude functions work against the live API.

### Key decisions locked in
- Model `claude-sonnet-4-20250514` (not `4-6` variant — unavailable on account)
- `fetch` + `ReadableStream` for client SSE (not `EventSource`, since endpoints are POST)
- `useSSE` hook exposes `start`/`stop` for explicit stream control
- `describeScreenshot` uses `image/png` media type (matches Playwright output)

### Files
- `lib/sse.ts` — rewritten
- `lib/claude.ts` — rewritten
- `lib/hooks/useSSE.ts` — new
- `scripts/test-claude.ts` — new

### Next phase should know
- `createSSEStream()` returns an object matching the `SSEWriter` interface from `lib/types.ts` — use `sse.send()` and `sse.close()` in API routes, return `sse.response()` as the route handler response
- `useSSE` hook needs `url` and `body` props; call `start()` to begin streaming
- Claude wrapper is stateless — conversation history management is Phase 6's responsibility
