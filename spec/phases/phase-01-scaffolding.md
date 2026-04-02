# Phase 1 — Project Scaffolding & Configuration

Status: complete
Started: 2026-04-02
Completed: 2026-04-02

---

## Goal

Bootstrap the Next.js 14 application with all dependencies, directory structure, environment config, and TypeScript types. After this phase, `npm run dev` runs a clean app with the full project skeleton in place and every module from the architecture has a placeholder file.

## Dependencies

None — this is the first phase.

## Context Manifest

> These are the skills, docs, and files `/start-phase` will load automatically.
> Edit this section if you want the agent to consult additional resources.

### Skills
- `git`

### Docs to Fetch
- https://nextjs.org/docs/getting-started/installation — Next.js 14 App Router setup
- https://ui.shadcn.com/docs/installation/next — shadcn/ui installation for Next.js
- https://supabase.com/docs/reference/javascript/installing — Supabase JS client setup

### Project Files to Read
- `spec/architecture.md` — Section 3 (Project Structure), Section 10 (Dependencies), Section 11 (Env Vars)
- `spec/dev_steps.md` — Phase 1 subtasks

## Pre-work Notes

> Decisions locked in:
> - **Next.js 14** (not 15) — avoids async params breaking changes
> - **No auth** — skip Supabase auth entirely for hackathon MVP. Use a hardcoded user_id where needed.
> - **shadcn/ui** for component library — init with New York style, zinc base color
> - Placeholder files should export empty functions or stub components (not truly empty files) so the build passes

---

## Subtasks

- [x] 1.1 Initialize Next.js project — `npx create-next-app@latest` with App Router, TypeScript, Tailwind, ESLint; verify `npm run dev` starts clean
- [x] 1.2 Install core dependencies — `@anthropic-ai/sdk`, `@supabase/supabase-js`, `playwright`, `@playwright/test`; run `npx playwright install chromium`
- [x] 1.3 Install UI dependencies — init shadcn/ui, add Button, Card, Input, Textarea, Badge, ScrollArea, Tabs; add `lucide-react`
- [x] 1.4 Environment configuration — create `.env.local` with all 4 keys, create `.env.example` (no secrets), ensure `.env.local` is in `.gitignore`
- [x] 1.5 Project structure setup — create full directory tree (`lib/`, `lib/agent/`, `components/`, `components/ui/`, `supabase/`), create placeholder files for all modules from architecture Section 3, verify build passes
- [x] 1.6 TypeScript types — create `lib/types.ts` with `Project`, `ExplorationSnapshot`, `Agent`, `Message`, `TestRun`, `TestRunStep` interfaces; `SSEEvent` union type; `SSEWriter` interface

### Gate

`npm run dev` starts without errors. `npm run build` passes. All placeholder files exist matching the architecture Section 3 tree. `lib/types.ts` compiles with all defined interfaces.

---

## Work Log

### Session 2026-04-02
Starting phase. Lite prime complete. Context manifest loaded.
Docs fetched: skipped (Next.js 14, shadcn/ui, Supabase patterns known)
Skills loaded: git
Project files read: spec/architecture.md (full), spec/dev_steps.md (Phase 1)

1.1: Initialized manually (npm init + next@14 install) since create-next-app refuses existing dirs. Dev server starts clean.
1.2: Installed @anthropic-ai/sdk, @supabase/supabase-js, playwright, @playwright/test. Chromium binary installed.
1.3: shadcn/ui initialized (new-york style, zinc). Added 7 components: button, card, input, textarea, badge, scroll-area, tabs. lucide-react installed.
1.4: .env.local and .env.example created. .gitignore covers .env*.local.
1.5: Full directory tree created. All placeholder files export stubs. Build passes.
1.6: lib/types.ts created with all 6 DB model interfaces, SSEEvent union (12 variants), SSEWriter interface.

All subtasks complete. Gate condition met: `npm run build` passes, all placeholder files present, types compile. Ready for /complete-phase.

### Session 2026-04-02 — Completed
Phase validated by user. All gate conditions met.

---

## Files Created / Modified

- `package.json` — scripts, deps (next@14, react, @anthropic-ai/sdk, @supabase/supabase-js, playwright, shadcn deps)
- `tsconfig.json` — TypeScript config with path aliases
- `next.config.js` — playwright in serverComponentsExternalPackages
- `tailwind.config.js` — shadcn/ui theme (CSS variables for zinc)
- `postcss.config.js` — tailwind + autoprefixer
- `.eslintrc.json` — next/core-web-vitals
- `.gitignore` — standard Next.js ignores
- `.env.local` / `.env.example` — 4 env vars
- `components.json` — shadcn/ui config
- `app/globals.css` — Tailwind directives + CSS variables (light/dark)
- `app/layout.tsx` — root layout with Inter font
- `app/page.tsx` — landing page placeholder
- `app/projects/[id]/page.tsx` — project detail placeholder
- `app/projects/[id]/explore/page.tsx` — explore placeholder
- `app/projects/[id]/chat/page.tsx` — chat placeholder
- `app/projects/[id]/runs/page.tsx` — runs placeholder
- `app/api/projects/route.ts` — CRUD placeholder
- `app/api/explore/route.ts` — explore SSE placeholder
- `app/api/chat/route.ts` — chat SSE placeholder
- `app/api/run/route.ts` — run SSE placeholder
- `components/ExplorationViewer.tsx` — stub
- `components/ChatWindow.tsx` — stub
- `components/RunResults.tsx` — stub
- `components/ui/{button,card,input,textarea,badge,scroll-area,tabs}.tsx` — shadcn components
- `lib/utils.ts` — cn() helper
- `lib/types.ts` — all TypeScript types
- `lib/supabase.ts` — stub
- `lib/claude.ts` — stub
- `lib/sse.ts` — stub
- `lib/runner.ts` — stub
- `lib/agent/{explorer,conversation,tools,prompts}.ts` — stubs
- `supabase/{schema,seed}.sql` — placeholders

---

## Decisions Made

- Used Next.js 14.2.35 (latest 14.x) — not 15
- Manual project init instead of create-next-app (existing files conflict)
- Tailwind v3 (not v4) — v4 incompatible with Next.js 14
- ESLint 8 (not 9) — v9 incompatible with eslint-config-next@14
- TypeScript 5.x — compatible with Next.js 14
- tailwind.config.js (not .ts) — avoids ESM/CJS conflict with commonjs package.json
- Playwright added to serverComponentsExternalPackages in next.config.js

---

## Completion Summary

Next.js 14 app fully scaffolded with all dependencies, directory structure, placeholder files, and TypeScript types.

**What was built:**
- Next.js 14.2.35 App Router project with TypeScript, Tailwind v3, ESLint 8
- shadcn/ui (new-york style, zinc) with 7 base components
- All placeholder files matching architecture Section 3 (4 pages, 4 API routes, 3 components, 7 lib modules, 2 SQL files)
- `lib/types.ts` with 6 DB model interfaces, 12-variant SSEEvent union, SSEWriter interface
- Environment config (.env.local + .env.example)

**Key decisions locked in:**
- Next.js 14 (not 15), Tailwind v3 (not v4), ESLint 8 (not 9), TS 5.x
- tailwind.config.js (not .ts) due to CJS/ESM conflict
- No auth — no user_id on projects table
- Playwright in serverComponentsExternalPackages

**Next phase should know:**
- All stubs throw "Not implemented" errors — replace them in-place, don't create new files
- `lib/types.ts` has all shared types ready to import
- `lib/utils.ts` has the `cn()` helper for shadcn components
- `@types/react` is v18 (matching React 18)
