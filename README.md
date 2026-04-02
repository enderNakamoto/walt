# WALT — Wallet-Aware LLM Tester

AI agent that explores Stellar/Soroban dApps and generates Playwright tests from natural language. Give it a URL, it crawls the dApp live (streaming screenshots), you describe a test in chat, and the agent generates + runs it.

## Features

- **URL-only exploration** — crawls any deployed Stellar dApp, extracts selectors, describes pages via Claude vision
- **Natural language test generation** — describe what to test in chat, agent asks clarifying questions, generates Playwright code
- **Wallet-aware** — uses `stellar-wallet-mock` to simulate Freighter wallet for signing transactions
- **Live streaming** — SSE-powered real-time updates for exploration, chat, and test execution
- **Step-by-step results** — see each test step with screenshots, pass/fail status, and error messages

## Quick Start

### Prerequisites

- Node.js 18+
- Supabase project (local or hosted)
- Anthropic API key

### Setup

```bash
# Clone and install
git clone https://github.com/enderNakamoto/walt.git
cd walt
npm install

# Install Playwright browser
npx playwright install chromium

# Configure environment
cp .env.example .env.local
# Edit .env.local with your keys
```

### Environment Variables

```env
ANTHROPIC_API_KEY=sk-ant-...          # Claude API key
NEXT_PUBLIC_SUPABASE_URL=https://...  # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...  # Supabase anon key
SUPABASE_SERVICE_ROLE_KEY=eyJ...      # Supabase service role key
```

### Database Setup

Run the schema against your Supabase project:

```bash
# Via Supabase dashboard SQL editor, or:
psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -f supabase/schema.sql

# Optional: seed demo data
psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -f supabase/seed.sql
```

### Run

```bash
npm run dev
# Open http://localhost:3000
```

## Demo Flow (~45 seconds)

1. **Create Project** — enter dApp URL (`https://sentinel-stellar-2.vercel.app/`), click Create. A testnet wallet is auto-generated and funded via Friendbot.

2. **Explore** — click Explore. Screenshots stream in live as the agent crawls pages, extracts buttons/inputs/links, and describes each page via Claude vision.

3. **Chat** — click Start Chat. Describe a test:
   > "Go to the faucet page and mint mockUSDC, then go to the vault page, deposit USDC, and verify the TVL increases"

   The agent asks clarifying questions, then generates a complete Playwright test with `stellar-wallet-mock`.

4. **Run** — click Run Test. Step-by-step results stream in with screenshots. See pass/fail for each step.

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Framework | Next.js 14 (App Router) |
| AI | Claude API (`@anthropic-ai/sdk`) |
| Browser automation | Playwright |
| Wallet mock | `stellar-wallet-mock` |
| Database + Storage | Supabase (Postgres + Storage) |
| UI | Tailwind CSS + shadcn/ui |

## Architecture

```
User → Landing Page → Create Project
         ↓
  Explore (Playwright crawls dApp, Claude describes pages)
         ↓
  Chat (Claude generates Playwright test via tool-calling)
         ↓
  Run (Playwright executes test in temp dir, streams results)
```

Three SSE endpoints power the real-time experience:
- `POST /api/explore` — exploration stream
- `POST /api/chat` — conversation stream
- `POST /api/run` — test execution stream

## Project Structure

```
app/                    # Next.js App Router
├── page.tsx            # Landing page
├── api/                # API routes
│   ├── projects/       # CRUD
│   ├── explore/        # SSE exploration
│   ├── chat/           # SSE conversation
│   └── run/            # SSE test execution
└── projects/[id]/      # Project pages
    ├── explore/        # Exploration viewer
    ├── chat/           # Chat UI
    └── runs/           # Test results

components/             # React components
├── ExplorationViewer   # Live screenshot stream
├── ChatWindow          # Chat + code display
└── RunResults          # Step-by-step results

lib/                    # Core libraries
├── agent/              # Explorer, conversation, tools, prompts
├── claude.ts           # Claude API wrapper
├── sse.ts              # SSE stream helper
├── supabase.ts         # Database client
└── runner.ts           # Local test runner
```

## License

ISC
