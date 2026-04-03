# WALT — Wallet-Aware LLM Tester

AI agent that explores Stellar/Soroban dApps and generates self-healing Playwright tests from natural language. Give it a URL, it crawls the dApp live, you describe a test in plain English, and the agent generates, runs, and auto-fixes it.

## Origin Story

We were building a niche prediction market on Soroban and hit a wall — there was **no way to programmatically mock Stellar wallets** in Playwright tests. Freighter doesn't expose a test API, and every E2E test needed real wallet interaction.

So we built **[stellar-wallet-mock](https://github.com/SentinelFi/stellar_wallet_mock)** — an open-source library that mocks the Freighter wallet in Playwright. Install it, pass a secret key, and your tests can sign Soroban transactions automatically.

Then we thought bigger: what if an AI agent could **explore any Stellar dApp, generate the tests, and self-heal when things break**? That's WALT. It uses `stellar-wallet-mock` under the hood to launch autonomous front-end agents that test your dApp and find bugs before your users do.

## Features

- **URL-only exploration** — crawls any deployed Stellar dApp, extracts full DOM data, accessibility tree, and describes pages via Claude vision
- **Live page inspection** — agent inspects pages with wallet mock installed before writing code, using verified selectors from the actual DOM
- **Natural language test generation** — describe what to test in chat, agent asks about success criteria step-by-step, generates multi-step Playwright tests
- **Self-healing tests** — when a test fails, the agent sees the failure screenshot, diagnoses the issue with Claude vision, fixes the code, and retries (up to 5 attempts). Transient errors (timeout, network) retry same code; structural errors (wrong selector, moved element) trigger intelligent healing
- **Smart waits** — React-aware wait utilities handle hydration, loading spinners, blockchain transaction timing, and controlled inputs. No brittle `waitForTimeout` calls
- **Wallet-aware** — uses [`stellar-wallet-mock`](https://github.com/SentinelFi/stellar_wallet_mock) to simulate Freighter wallet for signing Soroban transactions
- **Scheduled monitoring** — cron-based recurring runs (1h to 7d intervals) with detailed reports. Catch regressions before users do
- **Rich test results** — console logs, network errors, per-step screenshots, healing attempt history with detailed reports
- **Live streaming** — SSE-powered real-time updates for exploration, chat, test execution, and self-healing progress

## Quick Start

### Prerequisites

- **Docker** — required for local Supabase (Postgres + Storage)
- **Node.js 18+**
- **Anthropic API key** — for Claude API (vision + tool-calling)

### 1. Start Supabase (Docker)

WALT uses Supabase for the database and screenshot storage. Start it locally with Docker:

```bash
# Install Supabase CLI if you haven't
npm install -g supabase

# Start local Supabase (requires Docker running)
supabase start

# This starts Postgres on port 54322 and the API on port 54321
# Note the anon key and service role key printed in the output
```

> **Docker must be running.** Supabase spins up Postgres, Auth, Storage, and other services in containers. If you don't have Docker: [Install Docker Desktop](https://docs.docker.com/get-docker/).

### 2. Clone and Install

```bash
git clone https://github.com/enderNakamoto/walt.git
cd walt
npm install

# Install Playwright's Chromium browser
npx playwright install chromium
```

### 3. Configure Environment

```bash
cp .env.example .env.local
```

Edit `.env.local` with your keys:

```env
ANTHROPIC_API_KEY=sk-ant-...          # Claude API key (get from console.anthropic.com)
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321  # Local Supabase API URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...  # From `supabase start` output
SUPABASE_SERVICE_ROLE_KEY=eyJ...      # From `supabase start` output
CRON_SECRET=...                       # (optional) Protects the /api/cron endpoint
```

### 4. Set Up Database

```bash
# Apply schema to local Supabase
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -f supabase/schema.sql

# Optional: seed with demo data
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -f supabase/seed.sql
```

### 5. Run

```bash
npm run dev
# Open http://localhost:3000
```
## Architecture

```
User → Create Project (enter dApp URL)
         ↓
  Explore (Playwright + wallet mock crawls dApp, Claude vision describes pages)
         ↓
  Chat (agent inspects live pages, asks success criteria, generates test)
         ↓
  Run → Pass? → Done ✓
      → Fail (transient)? → Retry same code (up to 5x)
      → Fail (structural)? → Claude vision diagnoses → fixes code → retry
                                    ↑                              |
                                    └──────── self-healing loop ───┘
```

**API Endpoints:**
- `POST /api/explore` — SSE exploration stream
- `POST /api/chat` — SSE conversation stream
- `POST /api/run` — SSE test execution stream (with self-healing)
- `GET /api/cron/run-scheduled` — cron endpoint for scheduled runs
- `GET/POST /api/agents` — agent CRUD
- `GET /api/agents/:id/reports` — scheduled run reports

## Project Structure

```
app/                        # Next.js App Router
├── page.tsx                # Landing page
├── api/
│   ├── projects/           # Project CRUD
│   ├── explore/            # SSE exploration
│   ├── chat/               # SSE conversation
│   ├── run/                # SSE test execution
│   ├── agents/             # Agent CRUD + reports
│   ├── test-runs/          # Run history + steps
│   └── cron/               # Scheduled run endpoint
└── projects/[id]/          # Project pages
    ├── explore/            # Exploration viewer
    ├── chat/               # Chat UI
    └── runs/               # Test results + scheduling

components/                 # React components
├── ExplorationViewer.tsx   # Live screenshot stream
├── ChatWindow.tsx          # Chat + code display + agent switcher
├── RunResults.tsx          # Results, healing reports, scheduling
└── ThemeToggle.tsx         # Light/dark mode

lib/                        # Core libraries
├── agent/
│   ├── explorer.ts         # Exploration engine (rich DOM extraction)
│   ├── conversation.ts     # Chat engine (persistent browser + inspect_page)
│   ├── tools.ts            # Tool definitions (inspect_page, generate_test, ask_question)
│   └── prompts.ts          # System prompts (generation rules, timing, selectors)
├── claude.ts               # Claude API wrapper (chat, vision, diagnosis)
├── runner.ts               # Test runner (healing loop, transient vs structural)
├── wait-utils.ts           # Smart wait utilities (injected into tests)
├── scheduler.ts            # Local dev cron scheduler
├── sse.ts                  # SSE stream helper
└── supabase.ts             # Database client

presentation/               # Hackathon pitch deck (HTML)
dev_plans/                  # Phase specs and architecture plans
supabase/                   # Database schema
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Framework | Next.js 14 (App Router) |
| AI | Claude API (`@anthropic-ai/sdk`) with vision |
| Browser automation | Playwright |
| Wallet mock | [`stellar-wallet-mock`](https://github.com/SentinelFi/stellar_wallet_mock) |
| Database + Storage | Supabase (Postgres + Storage) |
| UI | Tailwind CSS + shadcn/ui |
| Fonts | JetBrains Mono + DM Sans |

## Key Dependencies

- [`stellar-wallet-mock`](https://github.com/SentinelFi/stellar_wallet_mock) — Open-source Freighter wallet mock for Playwright tests. Built by us as the foundation for WALT.
- `@anthropic-ai/sdk` — Claude API for vision analysis, test generation, and self-healing diagnosis
- `playwright` — Browser automation for exploration and test execution

