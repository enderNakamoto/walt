# Development Steps — WALT MVP

Each phase builds on the previous. Substeps within a phase can sometimes be parallelized, but phases themselves are sequential.

---

## Phase 1 — Project Scaffolding & Configuration

### 1.1 Initialize Next.js project
- `npx create-next-app@latest` with App Router, TypeScript, Tailwind, ESLint
- Verify `npm run dev` starts clean

### 1.2 Install core dependencies
- `@anthropic-ai/sdk` — Claude API
- `@supabase/supabase-js` — DB/auth/storage client
- `playwright` — browser automation (exploration)
- `@playwright/test` — test runner
- `npx playwright install chromium` — browser binary

### 1.3 Install UI dependencies
- `shadcn/ui` init (`npx shadcn@latest init`)
- Add base components: `Button`, `Card`, `Input`, `Textarea`, `Badge`, `ScrollArea`, `Tabs`
- Add `lucide-react` icons

### 1.4 Environment configuration
- Create `.env.local` template with `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- Create `.env.example` (no secrets, just key names)
- Add `.env.local` to `.gitignore`

### 1.5 Project structure setup
- Create directory tree: `lib/`, `lib/agent/`, `components/`, `components/ui/`, `supabase/`
- Create placeholder files for all modules listed in architecture Section 3
- Verify build passes with empty placeholders

### 1.6 TypeScript types
- Create `lib/types.ts` with interfaces: `Project`, `ExplorationSnapshot`, `Agent`, `Message`, `TestRun`, `TestRunStep`
- Create `SSEEvent` union type covering all SSE event shapes (status, screenshot, page_summary, page_discovered, question, test_code, text, step, done, waiting_for_user)
- Create `SSEWriter` interface

---

## Phase 2 — Supabase Setup & Database Schema

### 2.1 Create Supabase project
- Create project on Supabase dashboard (or use CLI `supabase init` + `supabase start` for local dev)
- Note project URL and keys

### 2.2 Write schema SQL
- Create `supabase/schema.sql` with all 6 tables from architecture Section 4:
  - `projects` — one per dApp, stores URL + wallet keys + cached exploration data
  - `exploration_snapshots` — per-page screenshot + DOM summary + selectors
  - `agents` — test suite created through conversation (draft/active status)
  - `messages` — conversation history linked to agent
  - `test_runs` — each manual execution with status + timing
  - `test_run_steps` — per-step results within a run
- Add all indexes from architecture
- Add foreign key cascades

### 2.3 Execute schema
- Run schema SQL against Supabase project (via dashboard SQL editor or `supabase db push`)
- Verify all 6 tables exist with correct columns and constraints

### 2.4 Configure Supabase Storage
- Create `screenshots` bucket for exploration + run screenshots
- Set bucket to public-read (screenshots need to be viewable in UI)
- Configure max file size (5MB per screenshot)

### 2.5 Supabase client library
- Create `lib/supabase.ts`:
  - `createBrowserClient()` — for client components (uses anon key)
  - `createServerClient()` — for API routes (uses service role key)
- Export typed client using generated types or manual typing

### 2.6 Auth configuration (minimal)
- Enable email auth in Supabase dashboard
- No RLS policies for MVP (single user, trusted server calls via service role key)
- Decide: skip auth entirely for hackathon OR add basic sign-in to protect the app

### 2.7 Seed data (optional)
- Create `supabase/seed.sql` with a sample project record for dev iteration
- Script to reset + reseed during development

---

## Phase 3 — Core Utilities (SSE + Claude Wrapper)

### 3.1 SSE stream helper
- Create `lib/sse.ts` per architecture Section 6.2
- `createSSEStream()` returns `{ readable, send, close, response }`
- Uses `TransformStream` + `TextEncoder`
- Sets correct headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`
- Add error handling: if writer fails, log and swallow (client may have disconnected)

### 3.2 SSE client-side hook
- Create `lib/hooks/useSSE.ts` — React hook for consuming SSE streams
- Accepts a URL/fetch config, returns `{ events, isStreaming, error }`
- Handles `EventSource` or `fetch` + `ReadableStream` parsing
- Auto-reconnect logic (optional for MVP)
- Properly cleans up on unmount

### 3.3 Claude API wrapper
- Create `lib/claude.ts` per architecture Section 6.1
- `chatWithTools(systemPrompt, messages, tools)` — single Claude call with tool definitions
- `describeScreenshot(screenshot, context)` — vision call for page description
- Error handling: catch rate limits, auth errors, model errors
- Log token usage for debugging

### 3.4 Claude API validation
- Write a quick test script or API route (`/api/test-claude`) to verify:
  - API key works
  - `chatWithTools` returns valid response
  - `describeScreenshot` returns text description from a sample image
- Remove test route after validation

---

## Phase 4 — Exploration Engine (Backend)

### 4.1 Selector extraction
- Implement `extractSelectors(page)` in `lib/agent/explorer.ts`
- Extract buttons: text, testId, computed selector (data-testid > aria-label > null)
- Extract inputs: label, testId, type, computed selector
- Extract links: text, href
- Handle edge cases: SVG-only buttons, dynamic elements, iframes

### 4.2 Screenshot capture + upload
- Implement `uploadToStorage(buffer, projectId, url)` helper
- Generates deterministic path: `screenshots/{projectId}/{urlSlug}.png`
- Uploads to Supabase Storage `screenshots` bucket
- Returns public URL for the stored screenshot

### 4.3 Snapshot persistence
- Implement `saveSnapshot(projectId, url, storagePath, summary, selectors)`
- Upserts to `exploration_snapshots` table (same URL replaces previous snapshot)
- Implement `updateProjectExplorationData(projectId, visited, snapshots)`
- Writes aggregated exploration results to `projects.exploration_data` JSONB column

### 4.4 Core exploration loop
- Implement `explore()` in `lib/agent/explorer.ts` per architecture Section 6.3
- Launch Chromium via Playwright
- Install `stellar-wallet-mock` if wallet secret provided
- BFS through pages: navigate → screenshot → extract selectors → Claude describe → save → discover links
- Filter links to same origin, skip fragments/query strings, skip already-visited
- SSE events emitted at each stage: `status`, `screenshot`, `page_summary`, `page_discovered`, `done`

### 4.5 Exploration API route
- Create `app/api/explore/route.ts`
- Accepts `POST { projectId, dappUrl }`
- Validates inputs (project exists, URL is valid http/https)
- Loads wallet secret from project record
- Calls `explore()` with SSE writer
- Returns SSE response
- Handle errors gracefully: send `{ type: "error", message }` event

### 4.6 Exploration abort handling
- Handle client disconnect (SSE stream closes) — abort Playwright browser
- Timeout: kill exploration after 2 minutes max
- Ensure browser.close() runs in all paths (finally block)

---

## Phase 5 — Exploration Frontend

### 5.1 Exploration page shell
- Create `app/projects/[id]/explore/page.tsx`
- Server component that loads project from Supabase
- Passes project data to client component `ExplorationViewer`
- "Start Exploration" button triggers the SSE stream

### 5.2 ExplorationViewer component
- Create `components/ExplorationViewer.tsx`
- Two-column layout: live screenshot (left), discovered pages list (right)
- Uses `useSSE` hook to connect to `POST /api/explore`

### 5.3 Live screenshot display
- Render the latest `screenshot` event as a base64 `<img>`
- Smooth transition/fade when screenshot updates
- Show loading skeleton before first screenshot arrives

### 5.4 Discovered pages sidebar
- List each page as it's discovered (from `page_discovered` events)
- States per page: queued (circle), loading (spinner), done (checkmark)
- Update state as `screenshot` and `page_summary` events arrive for each URL
- Show Claude's summary below each page entry

### 5.5 Status bar
- Show current status message from `status` events at the top
- Progress indicator (e.g., "Exploring page 3 of ~6")
- Show "Done — N pages discovered" when `done` event arrives

### 5.6 Post-exploration navigation
- When exploration completes, show "Start Chat" button
- Button navigates to `/projects/[id]/chat`
- Also allow re-exploration (new "Re-Explore" button)

---

## Phase 6 — Conversation Engine (Backend)

### 6.1 System prompt builder
- Create `lib/agent/prompts.ts` per architecture Section 6.6
- `buildSystemPrompt(explorationData)` — injects dApp URL, page summaries, selectors
- Test generation rules (import patterns, stellar-wallet-mock setup, selector priority, Soroban timeouts)
- Conversation rules (when to ask vs. generate)

### 6.2 Tool definitions
- Create `lib/agent/tools.ts` per architecture Section 6.5
- Define tools array: `ask_question`, `generate_test`, `navigate_and_screenshot`
- Each tool has name, description, input_schema with proper JSON Schema
- Export tool executor map: `executeTool(name, input)` dispatch

### 6.3 Tool executors
- `ask_question` — no executor needed, handled specially in conversation loop (breaks the loop)
- `generate_test` — saves code to agent record, handled specially in conversation loop
- `navigate_and_screenshot` — needs a Playwright browser context; may share the exploration browser or launch new one
  - Navigate to URL, screenshot, return base64 image as result

### 6.4 Message persistence
- Implement `loadMessages(agentId)` — loads all messages for agent, ordered by created_at
- Formats into Claude `MessageParam[]` array (role + content)
- Implement `saveMessage(agentId, role, content, metadata?)` — inserts to messages table
- Implement `saveTestCode(agentId, code)` — updates agent's `test_code` column

### 6.5 Conversation loop
- Implement `conversationRound()` in `lib/agent/conversation.ts` per architecture Section 6.4
- Load history → append user message → build system prompt with exploration data
- While-loop: call `chatWithTools` → handle response:
  - `stop_reason === "end_turn"` → extract text blocks, send via SSE, save, break
  - `stop_reason === "tool_use"` → iterate tool calls:
    - `ask_question` → send question via SSE, save, return (stream closes)
    - `generate_test` → save code, send `test_code` event, push tool result
    - Other tools → execute, send result via SSE, push tool result
  - Feed tool results back to Claude as next user message
- Send `done` event at end

### 6.6 Exploration data loader
- Implement `loadExplorationData(agentId)`:
  - Agent → Project → exploration_snapshots
  - Build `ExplorationData` object with dappUrl + all snapshots (url, summary, selectors)
- Cache in memory for the duration of a conversation round

### 6.7 Chat API route
- Create `app/api/chat/route.ts`
- Accepts `POST { agentId, message }`
- Validates: agent exists, message is non-empty
- Calls `conversationRound()` with SSE writer
- Returns SSE response
- Error handling: send error event, log

---

## Phase 7 — Chat Frontend

### 7.1 Chat page shell
- Create `app/projects/[id]/chat/page.tsx`
- Server component: load project + agents from Supabase
- If no agent exists, create one (draft) for this project on first visit
- Pass agentId + project data to client component

### 7.2 ChatWindow component
- Create `components/ChatWindow.tsx`
- Message list (scrollable) + input bar at bottom
- Messages rendered as bubbles: user (right), assistant (left)
- Auto-scroll to bottom on new messages

### 7.3 Message input and sending
- Input bar: textarea + Send button
- On submit: add user message to local state, POST to `/api/chat`
- Disable input while agent is responding (SSE stream active)
- Re-enable input when stream closes or `waiting_for_user` event received

### 7.4 SSE stream consumption
- Use `useSSE` hook connected to `/api/chat`
- Handle events:
  - `status` → show typing indicator with status text
  - `text` → append text to current assistant message
  - `question` → render as assistant message, re-enable input
  - `test_code` → render code block with syntax highlighting
  - `tool` → optionally show tool call activity indicator
  - `done` → finalize message, show "Run Test" button if test code exists
  - `waiting_for_user` → re-enable input

### 7.5 Code block rendering
- When `test_code` event arrives, render in a styled code block
- Syntax highlighting (use `prism-react-renderer` or similar lightweight lib)
- Copy-to-clipboard button on the code block

### 7.6 Run Test button
- Appears after test code is generated
- Navigates to `/projects/[id]/runs` and triggers test execution
- Or: inline run within chat page (decision: keep it simple, navigate)

### 7.7 Message history loading
- On page load, fetch existing messages from Supabase for this agent
- Render previous conversation before enabling new input
- Handle empty state: "Describe a test you'd like to create..."

---

## Phase 8 — Test Runner (Backend)

### 8.1 Runner core
- Implement `runTest()` in `lib/runner.ts` per architecture Section 7
- Create temp directory in `/tmp/stellar-test-{uuid}`
- Write test file (`test.spec.ts`), playwright config, package.json
- Set env vars: `WALLET_SECRET_KEY`, `DAPP_URL`

### 8.2 Dependency installation
- Run `npm install` in temp dir (installs `@playwright/test`, `stellar-wallet-mock`)
- SSE event: `{ type: "status", message: "Installing dependencies..." }`
- Handle install failure gracefully

### 8.3 Test execution
- Run `npx playwright test --reporter=json` in temp dir
- Capture stdout/stderr
- Parse `results.json` output file
- SSE event: `{ type: "status", message: "Running test..." }`

### 8.4 Result parsing and streaming
- Walk through `results.json` structure: suites → specs → tests → results
- For each step: emit `{ type: "step", index, name, status, durationMs, error, screenshot }`
- Read screenshot attachments from disk, convert to base64
- Emit final `{ type: "done", status, durationMs }`

### 8.5 Result persistence
- Create `test_runs` record at start (status: running)
- For each step: insert `test_run_steps` record
- Upload step screenshots to Supabase Storage
- Update `test_runs` with final status, duration, completed_at, error_summary

### 8.6 Run API route
- Create `app/api/run/route.ts`
- Accepts `POST { agentId }`
- Loads agent's test_code + project's dapp_url + wallet_secret
- Validates: agent has test_code, project has dapp_url
- Calls `runTest()` with SSE writer
- Returns SSE response

### 8.7 Cleanup and safety
- `finally` block: `rm -rf` temp directory
- Timeout: kill child process after 120 seconds
- Prevent path traversal in test code (sandbox concern — note for post-MVP)
- Handle concurrent runs: each gets its own temp dir, no conflicts

---

## Phase 9 — Run Results Frontend

### 9.1 Runs page shell
- Create `app/projects/[id]/runs/page.tsx`
- Server component: load project + agent + recent test runs from Supabase
- List previous runs with status badges (passed/failed/error)
- "Run Test" button at top

### 9.2 RunResults component
- Create `components/RunResults.tsx`
- Shows step-by-step progress of a test run
- Each step: name, status badge, duration, screenshot thumbnail, error message (if failed)

### 9.3 Live run streaming
- When "Run Test" clicked, POST to `/api/run`, consume SSE stream
- Show steps appearing one-by-one as `step` events arrive
- Show overall progress at top
- Final summary when `done` event arrives (passed/failed/error + total duration)

### 9.4 Screenshot viewer
- Click a step screenshot to view full-size in modal/lightbox
- For failed steps: highlight error message prominently, show screenshot of failure state

### 9.5 Run history list
- Below the current run, show previous runs
- Each run: timestamp, status badge, duration, expand to see steps
- Load from `test_runs` + `test_run_steps` tables

### 9.6 Re-run and iterate
- "Re-run" button to execute the same test again
- "Edit Test" link back to chat to modify the test
- "View Code" expandable to see the raw Playwright test source

---

## Phase 10 — Project Management & Navigation

### 10.1 Projects API
- Create `app/api/projects/route.ts`
- `POST` — create project `{ name, dapp_url, wallet_secret? }`
  - Derive `wallet_public` from secret if provided
  - Insert to `projects` table
  - Return created project
- `GET` — list all projects (ordered by created_at desc)

### 10.2 Single project API
- Create `app/api/projects/[id]/route.ts`
- `GET` — project detail with exploration_data
- `DELETE` — delete project + cascades

### 10.3 Landing page
- Create `app/page.tsx`
- "Create Project" form: name, dApp URL, wallet secret (optional)
- List of existing projects as cards
- Each card: name, URL, status (explored/not), link to project detail

### 10.4 Project detail page
- Create `app/projects/[id]/page.tsx`
- Show project info: name, URL, wallet public key
- Navigation tabs/buttons: Explore, Chat, Runs
- Show exploration summary if available (page count, page list)

### 10.5 Root layout
- Create `app/layout.tsx`
- Global styles (Tailwind), font, metadata
- Simple header with app name + nav
- No sidebar for MVP (page-level navigation is enough)

### 10.6 Project layout
- Create `app/projects/[id]/layout.tsx`
- Sub-navigation: Explore | Chat | Runs tabs
- Project name in header
- Back to projects list link

---

## Phase 11 — Integration, Polish & Demo Prep

### 11.1 End-to-end flow testing
- Manual walkthrough: create project → explore → chat → generate test → run
- Fix any broken handoffs between phases
- Verify SSE streams work correctly in all three endpoints

### 11.2 Error states
- No API key configured → show setup instructions
- Exploration fails (dApp unreachable) → show error in ExplorationViewer
- Claude API error → show retry option in chat
- Test run fails to install deps → show error in RunResults
- Empty states: no projects, no exploration data, no messages, no runs

### 11.3 Loading states
- Skeleton loaders for project list, exploration viewer, chat history
- Streaming indicators for all SSE-powered views
- Button loading states during async operations

### 11.4 Responsive layout
- Ensure all pages work on laptop-width screens (1280px+)
- Not targeting mobile for MVP, but don't break on smaller screens

### 11.5 Demo data preparation
- Identify or deploy a sample Stellar dApp to use in demo
- Pre-configure a project with wallet keys
- Practice the 45-second demo flow from architecture Section 9

### 11.6 Environment validation
- Startup check: verify all 4 env vars are set
- Log warnings for missing optional config
- Ensure Playwright chromium is installed (auto-install on first run or error message)

### 11.7 README and setup docs
- Write README.md with: overview, setup steps, env vars, how to run
- Include demo script for hackathon pitch

---

## Phase Summary

| Phase | Name | Depends On | Key Deliverable |
|-------|------|------------|-----------------|
| 1 | Scaffolding & Config | — | Running Next.js app with all deps |
| 2 | Supabase & Schema | 1 | 6 tables + Supabase client |
| 3 | Core Utilities | 1 | SSE helper + Claude wrapper working |
| 4 | Exploration Engine | 2, 3 | `/api/explore` streams page discovery |
| 5 | Exploration Frontend | 4 | Live screenshot viewer in browser |
| 6 | Conversation Engine | 2, 3, 4 | `/api/chat` with tool-calling loop |
| 7 | Chat Frontend | 6 | Chat UI generates test code |
| 8 | Test Runner | 2, 3 | `/api/run` executes tests locally |
| 9 | Run Results Frontend | 8 | Step-by-step results with screenshots |
| 10 | Project Management | 2 | CRUD + landing page + navigation |
| 11 | Integration & Polish | all | Demo-ready end-to-end flow |
