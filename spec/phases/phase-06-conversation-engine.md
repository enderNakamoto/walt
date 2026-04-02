# Phase 6 — Conversation Engine (Backend)

Status: complete
Started: 2026-04-02
Completed: 2026-04-02

---

## Goal

Build the conversation engine that powers the chat-based test generation flow. The user describes a test in natural language, Claude uses tool-calling to ask clarifying questions and generate Playwright test code. This is the core AI loop — system prompt with exploration context, tool definitions (ask_question, generate_test, navigate_and_screenshot), message persistence, and the agentic while-loop that processes tool calls until Claude produces a final response.

## Dependencies

- Phase 2 — Supabase client (`lib/supabase.ts`), `agents`, `messages` tables
- Phase 3 — `lib/claude.ts` (`chatWithTools`), `lib/sse.ts` (`createSSEStream`)
- Phase 4 — exploration data stored in `projects.exploration_data` and `exploration_snapshots`

## Context Manifest

> These are the skills, docs, and files `/start-phase` will load automatically.
> Edit this section if you want the agent to consult additional resources.

### Skills
- `git`
- `stellar-wallet-mock` — for understanding test generation patterns (import, fixture, wallet setup)

### Docs to Fetch
- https://docs.anthropic.com/en/docs/build-with-claude/tool-use — Claude tool-calling reference (tool definitions, tool results, agentic loop)

### Project Files to Read
- `spec/architecture.md` — Sections 6.4 (Conversation Loop), 6.5 (Tool Definitions), 6.6 (System Prompts), 5 (POST /api/chat)
- `lib/types.ts` — `SSEEvent`, `SSEWriter`, `ExplorationData`, `PageSelectors`, `Agent`, `Message`
- `lib/claude.ts` — `chatWithTools()` signature
- `lib/sse.ts` — `createSSEStream()` pattern
- `lib/supabase.ts` — `getAgent()`, `getMessages()`, `createMessage()`, `updateAgentTestCode()`, `getProject()`, `getSnapshots()`
- `lib/agent/conversation.ts` — current placeholder
- `lib/agent/tools.ts` — current placeholder
- `lib/agent/prompts.ts` — current placeholder
- `app/api/chat/route.ts` — current placeholder

## Pre-work Notes

> This section is for you to fill in before work begins.
> Add constraints, decisions already made, questions to resolve, patterns to follow, or anything the agent should know before touching code.

### Decisions already made
- **Model**: Use `claude-sonnet-4-20250514` (not `4-6` — see memory)
- **SSE close ownership**: The conversation engine should call `sse.close()` in its finally block (same pattern as explorer — see memory)
- **Tool result format**: Use `{ type: "tool_result", tool_use_id, content: JSON.stringify(...) }` per Claude API spec

---

## Subtasks

- [x] 1. System prompt builder — create `lib/agent/prompts.ts` per architecture Section 6.6. `buildSystemPrompt(explorationData)` injects dApp URL, page summaries, selectors, test generation rules, conversation rules.
- [x] 2. Tool definitions — create `lib/agent/tools.ts` per architecture Section 6.5. Define tools array: `ask_question`, `generate_test`, `navigate_and_screenshot`. Each with name, description, input_schema. Export tool executor map `executeTool(name, input)`.
- [x] 3. Tool executors — `ask_question` handled specially (breaks loop). `generate_test` saves code. `navigate_and_screenshot` launches Playwright, navigates, screenshots, returns base64.
- [x] 4. Message persistence — implement `loadMessages(agentId)` formatting into Claude `MessageParam[]`. Implement `saveMessage(agentId, role, content, metadata?)`. Implement `saveTestCode(agentId, code)` updating agent's `test_code`.
- [x] 5. Conversation loop — implement `conversationRound()` in `lib/agent/conversation.ts` per architecture Section 6.4. Load history, append user message, build system prompt, while-loop calling `chatWithTools`, handle `end_turn` and `tool_use` stop reasons.
- [x] 6. Exploration data loader — implement `loadExplorationData(agentId)`: Agent → Project → exploration_snapshots → build `ExplorationData` object.
- [x] 7. Chat API route — create `app/api/chat/route.ts`. Accepts `POST { agentId, message }`, validates inputs, calls `conversationRound()` with SSE writer, returns SSE response.

### Gate

`POST /api/chat` accepts an agent ID and user message, loads conversation history and exploration data, calls Claude with tool definitions, handles tool calls (ask_question breaks loop, generate_test saves code), streams responses via SSE, and persists all messages.

---

## Work Log

### Session 2026-04-02
Starting phase. Lite prime complete. Context manifest loaded.
Docs fetched: Claude tool-calling reference (knowledge-based)
Skills loaded: git, stellar-wallet-mock
Project files read: spec/architecture.md (§5, §6.4-6.6), lib/types.ts, lib/claude.ts, lib/supabase.ts, lib/agent/*.ts, app/api/chat/route.ts

- Implemented `lib/agent/prompts.ts` — `buildSystemPrompt()` with exploration data injection, test gen rules, conversation rules
- Implemented `lib/agent/tools.ts` — 3 tool definitions + `executeTool()` dispatcher, `navigateAndScreenshot()` executor
- Implemented `lib/agent/conversation.ts` — full agentic loop:
  - `conversationRound()` with while-loop, `end_turn` and `tool_use` handling
  - `ask_question` breaks loop and sends `waiting_for_user`
  - `generate_test` saves code via `updateAgentTestCode()`
  - `loadMessages()` formats DB messages into Claude `MessageParam[]`
  - `saveMessage()` and `saveTestCode()` for persistence
  - `loadExplorationData()` loads from cached `exploration_data` or falls back to snapshots
  - `sse.close()` in finally block per pattern
- Implemented `app/api/chat/route.ts` — POST validation, agent check, SSE streaming
- `npx tsc --noEmit` passes clean

All subtasks complete. Gate condition met. Ready for /complete-phase.

### Session 2026-04-02 — Completed
Phase validated by user. All gate conditions met.

---

## Files Created / Modified

- `lib/agent/prompts.ts` — rewritten from placeholder
- `lib/agent/tools.ts` — rewritten from placeholder
- `lib/agent/conversation.ts` — rewritten from placeholder
- `app/api/chat/route.ts` — rewritten from placeholder

---

## Decisions Made

- **Exploration data loading**: Try `project.exploration_data` (cached JSONB) first, fall back to building from `exploration_snapshots` table
- **Tool result typing**: Uses `Anthropic.ToolResultBlockParam` for proper typing instead of `any`
- **navigate_and_screenshot**: Launches a fresh Chromium instance per call (short-lived, closes in finally block)
- **SSE close ownership**: `conversationRound()` calls `sse.close()` in its `finally` block — API route does not close separately
- **Status events**: Sends "Thinking..." at start and "Using tool: {name}..." during tool calls for UI feedback

---

## Completion Summary

### What was built
- **System prompt builder** (`lib/agent/prompts.ts`): `buildSystemPrompt()` injects exploration data (dApp URL, page summaries, selectors), test generation rules (stellar-wallet-mock, selector priority, Soroban timeouts), and conversation rules.
- **Tool definitions** (`lib/agent/tools.ts`): 3 tools (`ask_question`, `generate_test`, `navigate_and_screenshot`) with JSON Schema, plus `executeTool()` dispatcher and `navigateAndScreenshot()` executor.
- **Conversation engine** (`lib/agent/conversation.ts`): Full agentic while-loop — loads message history, builds system prompt, calls Claude, handles `end_turn` and `tool_use` stop reasons, persists all messages, loads exploration data from cached JSONB or snapshots.
- **Chat API route** (`app/api/chat/route.ts`): POST endpoint accepting `{ agentId, message }`, validates inputs, streams SSE response.

### Key decisions locked in
- Exploration data loaded from `project.exploration_data` (cached), falls back to `exploration_snapshots` table
- `ask_question` tool breaks the loop, sends `waiting_for_user`, stream closes — user replies via new POST
- `generate_test` saves code to agent record via `updateAgentTestCode()`
- `navigate_and_screenshot` launches fresh Chromium per call (short-lived)
- `conversationRound()` owns `sse.close()` in its `finally` block
- Typed tool results using `Anthropic.ToolResultBlockParam`

### Files
- `lib/agent/prompts.ts` — rewritten
- `lib/agent/tools.ts` — rewritten
- `lib/agent/conversation.ts` — rewritten
- `app/api/chat/route.ts` — rewritten

### Next phase should know
- Chat API expects `{ agentId, message }` — Phase 7 (Chat Frontend) needs to POST this
- SSE events to handle: `status`, `text`, `question`, `test_code`, `tool`, `done`, `waiting_for_user`, `error`
- When `waiting_for_user` is received, re-enable input — user's reply triggers a new POST
- Agent's `test_code` column is updated when `generate_test` runs — Phase 8 (Test Runner) reads it from there
