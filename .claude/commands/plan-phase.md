---
description: Generate a detailed phase plan file for a given phase number
---

# Plan Phase

## Objective

Generate a pre-work plan file for a specific phase so the user can review and edit it before work begins. Includes a **Context Manifest** — the exact skills, docs, and files the agent will need when `/start-phase` runs. Do not start any implementation — this command only produces the plan document.

## Arguments

The user provides a phase number as the argument (e.g. `/plan-phase 4`).

## Process

### 1. Read context

- Read `spec/dev_steps.md` — extract all subtasks for the requested phase number
- Read `spec/progress.md` — check the phase's current status (must be `planned` to generate a plan)
- Read `spec/architecture.md` — understand what this phase's components depend on

### 2. Determine the phase file path

Phase file naming convention:
```
spec/phases/phase-{NN}-{slug}.md
```
where `{NN}` is zero-padded phase number and `{slug}` is a short kebab-case name derived from the phase title in `dev_steps.md`.

**Read the phase slug from `dev_steps.md`.** Phase slugs are defined there alongside each phase's subtasks. Do not hardcode slugs — derive them from the development list.

### 3. Build the Context Manifest

Determine which skills, external docs, and project files the agent will need to load when `/start-phase` runs. Use the mapping below as a baseline, then adjust based on the phase's specific subtasks and dependencies.

#### Phase → Context Mapping

**Project init / scaffolding phases:**
- Skills: `git`
- Docs to fetch:
  - https://nextjs.org/docs — Next.js App Router reference
  - https://supabase.com/docs — Supabase client + auth + storage
- Files: `spec/architecture.md`, `package.json`

**Agent core phases (Claude API, exploration, conversation):**
- Skills: `git`
- Docs to fetch:
  - https://docs.anthropic.com/en/docs/build-with-claude/tool-use — Claude tool-calling reference
  - https://playwright.dev/docs/api/class-page — Playwright Page API
- Files: `spec/architecture.md`, `lib/agent/`, `lib/claude.ts`, `lib/sse.ts`

**Frontend / UI phases:**
- Skills: `git`
- Docs to fetch:
  - https://nextjs.org/docs/app/building-your-application/routing — App Router routing
  - https://ui.shadcn.com/docs — shadcn/ui component reference
- Files: `spec/architecture.md`, `app/`, `components/`, `package.json`

**Database / Supabase phases:**
- Skills: `git`
- Docs to fetch:
  - https://supabase.com/docs/guides/database — Supabase Postgres guide
  - https://supabase.com/docs/guides/storage — Supabase Storage for screenshots
- Files: `spec/architecture.md`, `supabase/schema.sql`, `lib/supabase.ts`

**Test runner / execution phases:**
- Skills: `git`
- Docs to fetch:
  - https://playwright.dev/docs/test-configuration — Playwright test config
  - https://playwright.dev/docs/api/class-page — Playwright Page API
- Files: `spec/architecture.md`, `lib/runner.ts`, `app/api/run/route.ts`

**SSE / streaming phases:**
- Skills: `git`
- Docs to fetch:
  - https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events — SSE reference
- Files: `spec/architecture.md`, `lib/sse.ts`, `app/api/explore/route.ts`, `app/api/chat/route.ts`

**Deployment / polish phases:**
- Skills: `git`
- Docs to fetch:
  - https://vercel.com/docs — Vercel deployment
- Files: `spec/architecture.md`, `next.config.js`, `.env.local`, `package.json`

> **Note:** Most phases will span multiple categories. Combine the relevant docs and files from each category that applies.

### 4. Ask the user clarifying questions

Before writing the file, review the subtasks and architecture context for this phase. Identify anything that is ambiguous, has multiple valid design choices, or depends on decisions not already recorded in architecture.md or memory. Ask the user these questions directly — wait for answers before proceeding to write the file.

Examples of things worth asking about:
- Design choices that affect the API shape (SSE event format, error handling patterns)
- Whether to use a library or hand-roll (e.g. SSE helper, Claude wrapper)
- Edge cases where the architecture doc is silent
- Any constraints the user may want to enforce (component library choices, state management, auth flow)

Do not ask about things that are already clearly specified in architecture.md, dev_steps.md, or memory. Keep questions concise — one to three questions is typical. If nothing is genuinely ambiguous, skip this step and proceed directly to writing the file.

### 5. Generate the phase file

Write the file at the path from step 2 with the following structure:

```markdown
# Phase {N} — {Name}

Status: planned
Started: —
Completed: —

---

## Goal

{One paragraph describing what this phase builds and why it matters to the system.}

## Dependencies

{List components/modules that must exist before this phase can begin. Reference which prior phase produces each dependency.}

## Context Manifest

> These are the skills, docs, and files `/start-phase` will load automatically.
> Edit this section if you want the agent to consult additional resources.

### Skills
{List of skills to auto-load, e.g. `git`}

### Docs to Fetch
{List of URLs the agent will WebFetch at start, with one-line descriptions}

### Project Files to Read
{List of specific files/directories the agent must read before starting work}

## Pre-work Notes

> This section is for you to fill in before work begins.
> Add constraints, decisions already made, questions to resolve, patterns to follow, or anything the agent should know before touching code.

---

## Subtasks

{All numbered subtasks from dev_steps.md for this phase, as unchecked boxes}

- [ ] 1. ...
- [ ] 2. ...
...

### Gate

{The gate condition from dev_steps.md — what must be true before this phase is considered done.}

---

## Work Log

> Populated by the agent during work. Do not edit manually.

---

## Files Created / Modified

> Populated by the agent during work.

---

## Decisions Made

> Key architectural or implementation decisions locked in during this phase. Populated during work.

---

## Completion Summary

> Populated by /complete-phase. Do not edit manually.
```

### 6. Update progress.md

In the Phase Files table, change the phase row's Status column from `not generated` to `planned`.

### 7. Tell the user what to do next

Output a short message:
- Confirm the file was created at its path
- Show the **Context Manifest** summary — list the skills, docs, and key files that will be loaded
- Tell the user to open the file, read the subtasks, fill in the Pre-work Notes, and optionally edit the Context Manifest
- Tell them to run `/start-phase {N}` when they are ready — it will automatically clear context and begin work
