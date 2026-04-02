# Phase 10 — Project Management & Navigation

Status: complete
Started: 2026-04-02
Completed: 2026-04-02

---

## Goal

Build the project CRUD API, landing page, project detail page, and navigation layout that ties the entire app together. This is the glue phase — after this, a user can create a project, navigate to explore/chat/runs, and have a complete end-to-end experience.

## Dependencies

- Phase 1 — shadcn/ui components, root layout placeholder
- Phase 2 — Supabase client (`lib/supabase.ts`), `projects` table with Friendbot auto-funding
- Phase 5 — exploration page at `/projects/[id]/explore`
- Phase 7 — chat page at `/projects/[id]/chat`
- Phase 9 — runs page at `/projects/[id]/runs`

## Context Manifest

> These are the skills, docs, and files `/start-phase` will load automatically.
> Edit this section if you want the agent to consult additional resources.

### Skills
- `git`
- `frontend-design`

### Docs to Fetch
- https://nextjs.org/docs/app/building-your-application/routing — App Router routing (layouts, route groups, dynamic routes)

### Project Files to Read
- `spec/architecture.md` — Section 3 (Project Structure), Section 5 (CRUD /api/projects)
- `lib/types.ts` — `Project` interface
- `lib/supabase.ts` — `getProjects()`, `getProject()`, `createProject()`, `deleteProject()`
- `app/page.tsx` — current placeholder (landing page)
- `app/layout.tsx` — current root layout
- `app/projects/[id]/page.tsx` — current placeholder (project detail)
- `app/api/projects/route.ts` — current placeholder
- `components/ui/` — available shadcn components

## Pre-work Notes

> This section is for you to fill in before work begins.

### Decisions already made
- **No auth** — single user, no login (hackathon MVP)
- **Wallet auto-creation** — `createProject()` already handles Friendbot funding when no wallet_secret provided
- **No sidebar** — page-level navigation only (per architecture)
- **Project layout** — sub-nav tabs for Explore | Chat | Runs

---

## Subtasks

- [x] 1. Projects API — create `app/api/projects/route.ts`. POST creates project (name, dapp_url, wallet_secret optional). GET lists all projects.
- [x] 2. Single project API — create `app/api/projects/[id]/route.ts`. GET returns project detail. DELETE removes project with cascades.
- [x] 3. Landing page — create `app/page.tsx`. "Create Project" form (name, dApp URL, wallet secret optional). List existing projects as cards with name, URL, status, link to detail.
- [x] 4. Project detail page — create `app/projects/[id]/page.tsx`. Show project info (name, URL, wallet public key). Navigation buttons: Explore, Chat, Runs. Exploration summary if available.
- [x] 5. Root layout — update `app/layout.tsx`. Global styles, font, metadata. Simple header with app name. No sidebar.
- [x] 6. Project layout — create `app/projects/[id]/layout.tsx`. Sub-navigation tabs: Explore | Chat | Runs. Project name in header. Back to projects link.

### Gate

Landing page lists projects, create-project form works, project detail shows info with navigation tabs, sub-navigation between Explore/Chat/Runs works, and project deletion works.

---

## Work Log

### Session 2026-04-02
Starting phase. Context loaded.

- Implemented `app/api/projects/route.ts` — GET list + POST create with URL validation
- Created `app/api/projects/[id]/route.ts` — GET detail + DELETE with cascades
- Implemented `app/page.tsx` — landing page with create form (toggleable), project cards with status badges, delete buttons
- Implemented `app/projects/[id]/page.tsx` — project detail with info, 3 action cards (Explore/Chat/Runs), exploration summary
- Updated `app/layout.tsx` — header with WALT branding + TestTube icon
- Created `app/projects/[id]/layout.tsx` — project header with back link, sub-navigation tabs
- Created `app/projects/[id]/project-nav.tsx` — client component with active tab highlighting (Overview/Explore/Chat/Runs)
- `npx tsc --noEmit` passes clean

All subtasks complete. Gate condition met. Ready for /complete-phase.

### Session 2026-04-02 — Completed
Phase validated by user. All gate conditions met.

---

## Files Created / Modified

- `app/api/projects/route.ts` — rewritten from placeholder
- `app/api/projects/[id]/route.ts` — new file
- `app/page.tsx` — rewritten from placeholder
- `app/layout.tsx` — rewritten
- `app/projects/[id]/page.tsx` — rewritten from placeholder
- `app/projects/[id]/layout.tsx` — new file
- `app/projects/[id]/project-nav.tsx` — new file (client component)

---

## Decisions Made

- **Landing page**: Client component for interactive form + project list (fetches via API, not server component)
- **Create form**: Toggleable — hidden by default, shown on "Create Project" button click
- **Project cards**: Click navigates to detail, delete button stops propagation
- **Wallet display**: Truncated public key (first 8 + last 4 chars)
- **Sub-nav**: Client component `ProjectNav` with `usePathname()` for active tab highlighting
- **Overview tab**: Added as first tab in project nav (was not in original spec but needed for project detail page)
- **Layout nesting**: Project layout wraps all project sub-pages, root layout wraps everything with header

---

## Completion Summary

### What was built
- **Projects API**: GET list + POST create (with Friendbot auto-funding) + GET detail + DELETE
- **Landing page**: Create-project form with optional wallet secret, project cards with status badges and delete
- **Project detail**: Action cards (Explore/Chat/Runs), exploration summary, wallet info
- **Root layout**: WALT header with branding
- **Project layout**: Sub-navigation tabs (Overview/Explore/Chat/Runs) with active state, back link

### Key decisions locked in
- Landing page is client component (interactive form + fetch-based project list)
- Project nav uses `usePathname()` for active tab highlighting
- Overview tab added to project sub-nav for the detail page

### Files
- `app/api/projects/route.ts` — rewritten
- `app/api/projects/[id]/route.ts` — new
- `app/page.tsx` — rewritten
- `app/layout.tsx` — rewritten
- `app/projects/[id]/page.tsx` — rewritten
- `app/projects/[id]/layout.tsx` — new
- `app/projects/[id]/project-nav.tsx` — new

### Next phase should know
- All pages and API routes are in place — Phase 11 is integration testing and polish
- The full flow is: landing → create project → project detail → explore → chat → runs
