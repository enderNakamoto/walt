---
description: Prime agent with codebase understanding
---

# Prime: Load Project Context

## Objective

Build project understanding at the level requested. **Lite by default** — just enough to know where the project stands. Optionally deep-dive into specific areas.

## Arguments

```
/prime                                    → lite only
/prime agent                              → lite + agent core deep-dive
/prime frontend                           → lite + frontend deep-dive
/prime supabase                           → lite + database/storage deep-dive
/prime runner                             → lite + test runner deep-dive
/prime agent frontend                     → lite + both deep-dives
/prime agent frontend supabase runner     → lite + all deep-dives
```

Zero or more modules can be passed. Order doesn't matter.

---

## Part 1 — Lite Prime (always runs)

### 1a. Read core docs (in parallel)

- Read `README.md` — project overview, structure, tech stack
- Read `spec/architecture.md` — **only the first ~60 lines** (Overview + System Architecture diagram). Do NOT read the full file unless a deep-dive module needs it.
- Read `CLAUDE.md` if it exists
- Read `spec/preferences.md` — user coding preferences (hard requirements)

### 1b. Read progress and current state (in parallel)

- Read `spec/progress.md` — identify current phase and its status
- If a phase is `in_progress` or `paused`, read its phase file from `spec/phases/` — read the subtask checklist, Context Manifest, and Work Log to understand where work stopped
- `git log --oneline -15` — last 15 commits
- `git status` — any uncommitted work

### 1c. Extract from git

- Which phases have completion commits — treat as ground truth
- What the most recent commit was
- Cross-check against `progress.md`: if git shows phase N complete but progress.md disagrees, trust git and note the discrepancy

### 1d. Output lite summary

```
## Project: WALT — Wallet-Aware LLM Tester
- AI agent that explores Stellar dApps and generates Playwright tests from natural language
- Current phase: {N} — {name} ({status})
- Last commit: {hash} {message}
- Uncommitted changes: {yes/no}
- Next action: {suggestion}

Workflow: /plan-phase N · /start-phase N · /complete-phase N · /commit
```

Keep it short — 10-15 lines max. This is the whole output if no modules are passed.

---

## Part 2 — Deep-Dive Modules (only if requested)

Run requested modules in parallel. Each module appends its section to the lite summary.

### Module: `agent`

**What it reads:**
- `spec/architecture.md` — full Agent Architecture section (Claude wrapper, conversation loop, tools, prompts)
- `lib/agent/` — `explorer.ts`, `conversation.ts`, `tools.ts`, `prompts.ts`
- `lib/claude.ts` — Claude API wrapper
- `lib/sse.ts` — SSE stream helper

**What it reports:**
- Exploration loop: how Playwright crawls + Claude describes pages
- Conversation loop: tool-calling flow, how ask_question/generate_test work
- Tool definitions and their purposes
- System prompt structure
- Which pieces exist vs. still to be built

### Module: `frontend`

**What it reads:**
- `app/` directory structure — pages, layouts, API routes
- `components/` — ExplorationViewer, ChatWindow, RunResults, ui/
- `package.json` — dependencies and scripts
- Any `.env.example` or `.env.local` template

**What it reports:**
- Next.js App Router structure (pages, layouts, route groups)
- API routes: `/api/explore`, `/api/chat`, `/api/run`, `/api/projects`
- Component inventory and state
- Which pages/components exist vs. still to be built

### Module: `supabase`

**What it reads:**
- `supabase/schema.sql` — table definitions (projects, exploration_snapshots, agents, messages, test_runs, test_run_steps)
- `supabase/seed.sql` if it exists
- `lib/supabase.ts` — client setup (browser + server)
- Any RLS policies or migration files

**What it reports:**
- Tables and their relationships
- Which tables exist in the schema vs. actually created
- Storage buckets for screenshots
- Auth configuration state

### Module: `runner`

**What it reads:**
- `lib/runner.ts` — local Playwright test runner
- `app/api/run/route.ts` — run endpoint
- Any Playwright config templates or test fixtures

**What it reports:**
- How tests are executed (temp dir, npm install, npx playwright test)
- Result parsing and SSE streaming
- Environment variable handling (wallet secret, dApp URL)
- Which pieces exist vs. still to be built

---

## Output Format

Always lead with the lite summary. If modules were requested, append each module's section with a clear header:

```
## Project: WALT — Wallet-Aware LLM Tester
{lite summary}

## Agent Core Deep-Dive
{only if /prime agent}

## Frontend Deep-Dive
{only if /prime frontend}

## Supabase Deep-Dive
{only if /prime supabase}

## Test Runner Deep-Dive
{only if /prime runner}
```

**Make it scannable — bullet points, short lines, no walls of text.**
