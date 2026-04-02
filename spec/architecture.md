# Stellar Agentic Testing Platform — Hackathon MVP Architecture

## 1. Overview

An AI agent that explores Stellar/Soroban dApps and generates Playwright tests from natural language. User provides a dApp URL, the agent crawls it live (streaming screenshots), the user describes a test in chat, and the agent generates + runs it.

### MVP Principles

- **URL-only access**: Agent crawls deployed dApps, no source code required
- **Claude API directly**: Single LLM provider, raw `@anthropic-ai/sdk` with hand-rolled tool loop
- **Local execution**: Playwright runs on the server, no Fly Machines
- **Single persona**: One wallet per project (multi-persona is post-hackathon)
- **No scheduling**: Manual "Run" button only
- **Minimal infra**: Next.js + Supabase + Claude API — nothing else

### What's Cut from Full Architecture

| Full Version | MVP | Why |
|---|---|---|
| BullMQ + Redis scheduling | Manual run button | No cron needed for demo |
| Fly Machines (remote VMs) | Local Playwright execution | Eliminates infra complexity |
| 3 LLM providers (Claude, GPT-4, Gemini) | Claude only | One provider is enough |
| Multi-tenancy (accounts, members, RLS) | Single user, basic Supabase auth | No teams for demo |
| Personas (multi-actor wallets) | Single wallet per project | Simplifies exploration + test gen |
| Failure analysis + self-healing | Skip | Mention in pitch as future |
| Notifications (email, Slack, webhook) | Skip | Dashboard is enough |
| Metering + billing | Skip | Not needed for demo |

---

## 2. System Architecture

```
┌──────────────────────────────────────────────────────────┐
│                     Vercel (Next.js)                      │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐ │
│  │  Explore UI  │  │   Chat UI    │  │  Run Results   │ │
│  │  (live       │  │  (SSE stream │  │  (screenshots, │ │
│  │  screenshots)│  │   + chat)    │  │   pass/fail)   │ │
│  └──────┬───────┘  └──────┬───────┘  └───────┬────────┘ │
│         │                 │                   │          │
│  ┌──────▼─────────────────▼───────────────────▼────────┐ │
│  │                 API Routes (Next.js)                  │ │
│  │  POST /api/explore     (SSE — exploration stream)    │ │
│  │  POST /api/chat        (SSE — conversation stream)   │ │
│  │  POST /api/run         (SSE — test execution stream) │ │
│  │  GET  /api/projects    (CRUD)                        │ │
│  └──────┬─────────────────┬───────────────────┬────────┘ │
└─────────┼─────────────────┼───────────────────┼──────────┘
          │                 │                   │
   ┌──────▼──────┐   ┌─────▼──────┐   ┌───────▼────────┐
   │  Supabase   │   │  Claude    │   │   Playwright   │
   │             │   │  API       │   │   (local)      │
   │ - Postgres  │   │            │   │                │
   │ - Auth      │   │ Tool calls │   │ - Chromium     │
   │ - Storage   │   │ + vision   │   │ - wallet-mock  │
   └─────────────┘   └────────────┘   └────────────────┘
```

**Three external dependencies. That's it.**

---

## 3. Project Structure

```
stellar-test-agent/
├── package.json
├── next.config.js
├── .env.local                      # ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_KEY
│
├── app/                            # Next.js App Router
│   ├── page.tsx                    # Landing — create project (enter dApp URL)
│   ├── layout.tsx                  # Root layout
│   │
│   ├── projects/
│   │   └── [id]/
│   │       ├── page.tsx            # Project detail — explore button + page map
│   │       ├── explore/page.tsx    # Live exploration viewer
│   │       ├── chat/page.tsx       # Chat UI for test creation
│   │       └── runs/page.tsx       # Test run results
│   │
│   └── api/
│       ├── projects/
│       │   └── route.ts            # CRUD for projects
│       ├── explore/
│       │   └── route.ts            # POST → SSE stream of exploration
│       ├── chat/
│       │   └── route.ts            # POST → SSE stream of agent conversation
│       └── run/
│           └── route.ts            # POST → SSE stream of test execution
│
├── components/
│   ├── ExplorationViewer.tsx       # Live screenshot stream + page list
│   ├── ChatWindow.tsx              # Chat messages + code display
│   ├── RunResults.tsx              # Step-by-step results with screenshots
│   └── ui/                         # shadcn components
│
├── lib/
│   ├── supabase.ts                 # Supabase client (browser + server)
│   ├── claude.ts                   # Claude API wrapper (~100 lines)
│   ├── agent/
│   │   ├── explorer.ts             # Exploration loop (Playwright + Claude)
│   │   ├── conversation.ts         # Chat loop (Claude tool-calling)
│   │   ├── tools.ts                # Tool definitions + executors
│   │   └── prompts.ts              # System prompts for each mode
│   ├── runner.ts                   # Local Playwright test runner
│   └── sse.ts                      # SSE stream helper
│
└── supabase/
    ├── schema.sql                  # Simplified DB schema
    └── seed.sql                    # Dev seed data (optional)
```

**Single Next.js app. No monorepo, no packages/, no turborepo.** Everything lives in one deployable unit.

---

## 4. Database Schema (Simplified)

```sql
-- Projects — one per dApp
CREATE TABLE projects (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name            text NOT NULL,
    dapp_url        text NOT NULL,
    wallet_secret   text,            -- single wallet secret key (encrypted)
    wallet_public   text,            -- derived public key (safe to display)
    exploration_data jsonb,          -- cached exploration results
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- Exploration snapshots — one per page discovered
CREATE TABLE exploration_snapshots (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    url             text NOT NULL,
    screenshot_path text,            -- Supabase Storage path (PNG)
    dom_summary     text,            -- Claude's description of the page
    selectors       jsonb,           -- {buttons: [...], inputs: [...], links: [...]}
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- Agents — a test suite created through conversation
CREATE TABLE agents (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name            text NOT NULL,
    description     text,            -- user's natural language intent
    test_code       text,            -- generated Playwright test source
    status          text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'active')),
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- Messages — conversation history for test creation
CREATE TABLE messages (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id        uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    role            text NOT NULL CHECK (role IN ('user', 'assistant')),
    content         text NOT NULL,
    metadata        jsonb,           -- {screenshots: [...], tool_calls: [...]}
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- Test runs — each manual execution
CREATE TABLE test_runs (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id        uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    status          text NOT NULL DEFAULT 'running'
                    CHECK (status IN ('running', 'passed', 'failed', 'error')),
    started_at      timestamptz NOT NULL DEFAULT now(),
    completed_at    timestamptz,
    duration_ms     integer,
    error_summary   text
);

-- Test run steps — per-step results within a run
CREATE TABLE test_run_steps (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    test_run_id     uuid NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
    step_index      integer NOT NULL,
    name            text NOT NULL,
    status          text NOT NULL CHECK (status IN ('passed', 'failed', 'skipped')),
    screenshot_path text,            -- Supabase Storage path
    error_message   text,
    duration_ms     integer
);

-- Indexes
CREATE INDEX idx_snapshots_project ON exploration_snapshots(project_id);
CREATE INDEX idx_agents_project ON agents(project_id);
CREATE INDEX idx_messages_agent ON messages(agent_id);
CREATE INDEX idx_runs_agent ON test_runs(agent_id);
CREATE INDEX idx_steps_run ON test_run_steps(test_run_id);
```

**6 tables. No accounts, no personas, no conversations table, no notifications, no usage events.**

Removed from full schema:
- `accounts` + `account_members` (no multi-tenancy)
- `personas` (single wallet on project)
- `conversations` (messages link directly to agent)
- `notifications` (no notification system)
- `usage_events` (no metering)

---

## 5. API Design

Three SSE endpoints (the core of the product) + one CRUD endpoint.

### POST `/api/explore`

Triggers agent exploration of a dApp. Returns SSE stream.

**Request:**
```json
{ "projectId": "uuid", "dappUrl": "https://stellar-vault.app" }
```

**SSE events emitted:**
```
data: {"type": "status", "message": "Navigating to /..."}
data: {"type": "screenshot", "url": "/", "image": "data:image/jpeg;base64,..."}
data: {"type": "page_summary", "url": "/", "summary": "Landing page with...", "selectors": {...}}
data: {"type": "page_discovered", "url": "/vault"}
data: {"type": "screenshot", "url": "/vault", "image": "data:image/jpeg;base64,..."}
data: {"type": "page_summary", "url": "/vault", "summary": "Vault page with deposit form...", "selectors": {...}}
...
data: {"type": "done", "totalPages": 4}
```

### POST `/api/chat`

Sends a user message to the agent. Returns SSE stream of the agent's response (may include multiple Claude rounds).

**Request:**
```json
{ "agentId": "uuid", "message": "Test that a user can deposit 100 XLM" }
```

**SSE events emitted:**
```
data: {"type": "status", "message": "Thinking..."}
data: {"type": "question", "content": "What should we assert after the deposit?"}
  ← connection closes, user replies, new POST /api/chat
data: {"type": "status", "message": "Generating test..."}
data: {"type": "test_code", "code": "import { test } from '@playwright/test'..."}
data: {"type": "text", "content": "I've generated your test! It will:\n1. Navigate to /vault\n2. ..."}
data: {"type": "done"}
```

**Important**: When Claude calls `ask_question`, the SSE stream sends the question and closes. The user's answer comes as a new `POST /api/chat`. The conversation history is loaded from the `messages` table each time, so Claude has full context.

### POST `/api/run`

Executes a generated test locally. Returns SSE stream of progress.

**Request:**
```json
{ "agentId": "uuid" }
```

**SSE events emitted:**
```
data: {"type": "status", "message": "Starting test..."}
data: {"type": "step", "index": 0, "name": "navigate to /vault", "status": "passed", "screenshot": "data:image/jpeg;base64,..."}
data: {"type": "step", "index": 1, "name": "fill deposit amount", "status": "passed", "screenshot": "data:image/jpeg;base64,..."}
data: {"type": "step", "index": 2, "name": "click Deposit", "status": "passed", "screenshot": "data:image/jpeg;base64,..."}
data: {"type": "step", "index": 3, "name": "assert vault balance", "status": "failed", "error": "Expected '100' but got '0'", "screenshot": "data:image/jpeg;base64,..."}
data: {"type": "done", "status": "failed", "duration_ms": 12340}
```

### CRUD `/api/projects`

Standard REST. No SSE.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/projects` | Create project `{name, dapp_url, wallet_secret?}` |
| GET | `/api/projects` | List user's projects |
| GET | `/api/projects/:id` | Project detail with exploration data |
| DELETE | `/api/projects/:id` | Delete project |

---

## 6. Agent Architecture

### 6.1 Claude API Wrapper

Thin wrapper around `@anthropic-ai/sdk`. ~100 lines.

```typescript
// lib/claude.ts
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export async function chatWithTools(
    systemPrompt: string,
    messages: Anthropic.MessageParam[],
    tools: Anthropic.Tool[],
): Promise<Anthropic.Message> {
    return client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        system: systemPrompt,
        messages,
        tools,
    });
}

export async function describeScreenshot(
    screenshot: Buffer,
    context: string,
): Promise<string> {
    const response = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 500,
        messages: [{
            role: "user",
            content: [
                {
                    type: "image",
                    source: {
                        type: "base64",
                        media_type: "image/jpeg",
                        data: screenshot.toString("base64"),
                    },
                },
                { type: "text", text: context },
            ],
        }],
    });
    return response.content[0].type === "text" ? response.content[0].text : "";
}
```

### 6.2 SSE Helper

Reusable across all three streaming endpoints.

```typescript
// lib/sse.ts
export function createSSEStream() {
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    const encoder = new TextEncoder();

    return {
        readable: stream.readable,
        send: (data: any) => {
            writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        },
        close: () => writer.close(),
        response: () => new Response(stream.readable, {
            headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            },
        }),
    };
}
```

### 6.3 Exploration Loop

Playwright crawls the dApp. Claude describes each page. Screenshots stream to browser via SSE.

```typescript
// lib/agent/explorer.ts
import { chromium, Page } from "playwright";
import { installMockStellarWallet } from "stellar-wallet-mock";
import { describeScreenshot } from "../claude";

export async function explore(
    dappUrl: string,
    walletSecret: string | null,
    sse: SSEWriter,
    projectId: string,
) {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    // Install wallet mock so agent sees connected-wallet UI
    if (walletSecret) {
        await installMockStellarWallet({ page, secretKey: walletSecret });
    }

    const visited = new Set<string>();
    const toVisit = [dappUrl];
    const origin = new URL(dappUrl).origin;

    while (toVisit.length > 0) {
        const url = toVisit.shift()!;
        if (visited.has(url)) continue;
        visited.add(url);

        // Navigate
        sse.send({ type: "status", message: `Navigating to ${url}...` });
        await page.goto(url, { waitUntil: "networkidle" });

        // Screenshot — stream JPEG to browser immediately
        const screenshotBuf = await page.screenshot({ type: "jpeg", quality: 60 });
        sse.send({
            type: "screenshot",
            url,
            image: `data:image/jpeg;base64,${screenshotBuf.toString("base64")}`,
        });

        // Extract interactive elements from DOM
        const selectors = await extractSelectors(page);

        // Ask Claude to describe the page (vision)
        const summary = await describeScreenshot(
            screenshotBuf,
            `Describe this page of a Stellar dApp. URL: ${url}\n`
            + `Interactive elements found: ${JSON.stringify(selectors)}`
        );

        sse.send({ type: "page_summary", url, summary, selectors });

        // Upload PNG to Supabase Storage + save snapshot to DB
        const pngBuf = await page.screenshot({ type: "png" });
        const storagePath = await uploadToStorage(pngBuf, projectId, url);
        await saveSnapshot(projectId, url, storagePath, summary, selectors);

        // Discover new links
        const links = await page.$$eval("a[href]", els =>
            els.map(a => (a as HTMLAnchorElement).href)
        );
        for (const link of links) {
            const normalized = link.split("#")[0].split("?")[0];
            if (normalized.startsWith(origin) && !visited.has(normalized)) {
                toVisit.push(normalized);
                sse.send({ type: "page_discovered", url: normalized });
            }
        }
    }

    // Cache exploration summary on project
    await updateProjectExplorationData(projectId, visited, /* snapshots */);

    sse.send({ type: "done", totalPages: visited.size });
    await browser.close();
}

async function extractSelectors(page: Page) {
    return page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll("button, [role='button']")).map(el => ({
            text: el.textContent?.trim(),
            testId: el.getAttribute("data-testid"),
            selector: el.getAttribute("data-testid")
                ? `[data-testid="${el.getAttribute("data-testid")}"]`
                : el.getAttribute("aria-label")
                    ? `[aria-label="${el.getAttribute("aria-label")}"]`
                    : null,
        }));
        const inputs = Array.from(document.querySelectorAll("input, textarea, select")).map(el => ({
            label: el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.getAttribute("name"),
            testId: el.getAttribute("data-testid"),
            type: el.getAttribute("type"),
            selector: el.getAttribute("data-testid")
                ? `[data-testid="${el.getAttribute("data-testid")}"]`
                : null,
        }));
        const links = Array.from(document.querySelectorAll("a[href]")).map(el => ({
            text: el.textContent?.trim(),
            href: (el as HTMLAnchorElement).href,
        }));
        return { buttons, inputs, links };
    });
}
```

### 6.4 Conversation Loop (Agent Tool-Calling)

Claude receives exploration data as context. User describes a test in natural language. Claude uses tools to ask questions and generate test code.

```typescript
// lib/agent/conversation.ts
import { chatWithTools } from "../claude";
import { buildSystemPrompt } from "./prompts";
import { tools, executeTool } from "./tools";

export async function conversationRound(
    agentId: string,
    userMessage: string,
    sse: SSEWriter,
) {
    // Load history from DB
    const history = await loadMessages(agentId);
    history.push({ role: "user", content: userMessage });
    await saveMessage(agentId, "user", userMessage);

    // Load exploration data for context
    const explorationData = await loadExplorationData(agentId);
    const systemPrompt = buildSystemPrompt(explorationData);

    // Agent loop — runs until Claude stops calling tools
    while (true) {
        const response = await chatWithTools(systemPrompt, history, tools);

        // Add Claude's response to history
        history.push({ role: "assistant", content: response.content });

        // Handle end of turn — Claude is done
        if (response.stop_reason === "end_turn") {
            for (const block of response.content) {
                if (block.type === "text") {
                    sse.send({ type: "text", content: block.text });
                    await saveMessage(agentId, "assistant", block.text);
                }
            }
            break;
        }

        // Handle tool calls
        if (response.stop_reason === "tool_use") {
            const toolResults: any[] = [];

            for (const block of response.content) {
                if (block.type === "tool_use") {
                    // Special case: ask_question breaks the loop
                    if (block.name === "ask_question") {
                        const question = (block.input as any).question;
                        sse.send({ type: "question", content: question });
                        await saveMessage(agentId, "assistant", question, {
                            tool_call: "ask_question",
                        });
                        // Save partial history so next round can continue
                        // The SSE closes. User replies → new POST /api/chat.
                        sse.send({ type: "waiting_for_user" });
                        return;
                    }

                    // Special case: generate_test saves the code
                    if (block.name === "generate_test") {
                        const code = (block.input as any).code;
                        await saveTestCode(agentId, code);
                        sse.send({ type: "test_code", code });
                        toolResults.push({
                            type: "tool_result",
                            tool_use_id: block.id,
                            content: JSON.stringify({ success: true }),
                        });
                        continue;
                    }

                    // General tool execution
                    const result = await executeTool(block.name, block.input);
                    sse.send({ type: "tool", name: block.name, result });
                    toolResults.push({
                        type: "tool_result",
                        tool_use_id: block.id,
                        content: JSON.stringify(result),
                    });
                }
            }

            // Feed results back to Claude
            history.push({ role: "user", content: toolResults });
        }
    }

    sse.send({ type: "done" });
}
```

### 6.5 Tool Definitions

```typescript
// lib/agent/tools.ts
import Anthropic from "@anthropic-ai/sdk";

export const tools: Anthropic.Tool[] = [
    {
        name: "ask_question",
        description: "Ask the user a clarifying question before generating the test. Use this when you need to know: which page, what values to input, what to assert, or edge cases.",
        input_schema: {
            type: "object" as const,
            properties: {
                question: { type: "string", description: "The question to ask the user" },
            },
            required: ["question"],
        },
    },
    {
        name: "generate_test",
        description: "Generate the final Playwright test code. Only call this when you have enough information from the user and exploration data.",
        input_schema: {
            type: "object" as const,
            properties: {
                code: { type: "string", description: "Complete Playwright test code using stellar-wallet-mock" },
                name: { type: "string", description: "Short name for the test" },
                description: { type: "string", description: "What the test verifies" },
            },
            required: ["code", "name"],
        },
    },
    {
        name: "navigate_and_screenshot",
        description: "Navigate to a URL in the exploration browser and take a screenshot. Use to verify current state of a page.",
        input_schema: {
            type: "object" as const,
            properties: {
                url: { type: "string", description: "URL to navigate to" },
            },
            required: ["url"],
        },
    },
];
```

### 6.6 System Prompts

```typescript
// lib/agent/prompts.ts
export function buildSystemPrompt(explorationData: ExplorationData): string {
    return `You are a Stellar dApp test generation agent. You help users create Playwright tests for Stellar/Soroban dApps.

## Your capabilities
- You have exploration data from crawling the dApp (page screenshots, interactive elements, selectors)
- You generate Playwright tests that use stellar-wallet-mock for wallet interactions
- You ask clarifying questions when the user's intent is ambiguous

## Exploration data for this dApp
URL: ${explorationData.dappUrl}

### Discovered pages:
${explorationData.snapshots.map(s => `
**${s.url}**
Summary: ${s.dom_summary}
Buttons: ${JSON.stringify(s.selectors.buttons)}
Inputs: ${JSON.stringify(s.selectors.inputs)}
Links: ${JSON.stringify(s.selectors.links)}
`).join("\n")}

## Test generation rules
1. Always import { test, expect } from '@playwright/test' and { installMockStellarWallet } from 'stellar-wallet-mock'
2. Call installMockStellarWallet({ page, secretKey: process.env.WALLET_SECRET_KEY }) BEFORE page.goto()
3. Use data-testid selectors when available, fall back to aria-label, then getByText()
4. Use { timeout: 45_000 } for assertions after Soroban transactions (they take 5-45s on testnet)
5. Use test.describe.serial() when test steps must run in order

## Conversation rules
- Use ask_question tool when you need clarification (which page, what values, what to assert)
- Don't assume values — ask the user
- When you have enough info, use generate_test to produce the code
- Keep responses concise`;
}
```

---

## 7. Local Test Runner

Instead of Fly Machines, tests run on the same server via a child process.

```typescript
// lib/runner.ts
import { exec } from "child_process";
import { writeFile, mkdir, rm } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";

export async function runTest(
    testCode: string,
    dappUrl: string,
    walletSecret: string | null,
    sse: SSEWriter,
): Promise<{ status: "passed" | "failed" | "error"; durationMs: number }> {
    const runId = randomUUID();
    const tmpDir = join("/tmp", `stellar-test-${runId}`);
    await mkdir(tmpDir, { recursive: true });

    try {
        // Write test file
        await writeFile(join(tmpDir, "test.spec.ts"), testCode);

        // Write playwright config
        await writeFile(join(tmpDir, "playwright.config.ts"), `
import { defineConfig } from "@playwright/test";
export default defineConfig({
    testDir: ".",
    timeout: 60_000,
    expect: { timeout: 45_000 },
    use: {
        baseURL: "${dappUrl}",
        screenshot: "on",
        trace: "retain-on-failure",
    },
    reporter: [["json", { outputFile: "results.json" }]],
});
        `);

        // Write package.json for the temp project
        await writeFile(join(tmpDir, "package.json"), JSON.stringify({
            type: "module",
            dependencies: {
                "@playwright/test": "latest",
                "stellar-wallet-mock": "latest",
            },
        }));

        sse.send({ type: "status", message: "Installing dependencies..." });
        await execAsync("npm install", { cwd: tmpDir });

        sse.send({ type: "status", message: "Running test..." });

        // Set environment variables
        const env = {
            ...process.env,
            WALLET_SECRET_KEY: walletSecret || "",
            DAPP_URL: dappUrl,
        };

        const start = Date.now();
        await execAsync("npx playwright test --reporter=json", { cwd: tmpDir, env });
        const durationMs = Date.now() - start;

        // Parse results
        const results = JSON.parse(
            await readFile(join(tmpDir, "results.json"), "utf-8")
        );

        // Stream step-by-step results
        for (const suite of results.suites) {
            for (const spec of suite.specs) {
                for (const test of spec.tests) {
                    for (const result of test.results) {
                        const screenshot = result.attachments?.find(
                            (a: any) => a.contentType?.startsWith("image/")
                        );
                        sse.send({
                            type: "step",
                            name: spec.title,
                            status: result.status,
                            durationMs: result.duration,
                            error: result.error?.message,
                            screenshot: screenshot
                                ? `data:image/png;base64,${readFileSync(screenshot.path).toString("base64")}`
                                : null,
                        });
                    }
                }
            }
        }

        const status = results.suites.every((s: any) =>
            s.specs.every((sp: any) =>
                sp.tests.every((t: any) =>
                    t.results.every((r: any) => r.status === "passed")
                )
            )
        ) ? "passed" : "failed";

        sse.send({ type: "done", status, durationMs });
        return { status, durationMs };

    } catch (err: any) {
        sse.send({ type: "done", status: "error", error: err.message });
        return { status: "error", durationMs: 0 };
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
}

function execAsync(cmd: string, opts: any): Promise<string> {
    return new Promise((resolve, reject) => {
        exec(cmd, opts, (err, stdout, stderr) => {
            if (err) reject(err);
            else resolve(stdout);
        });
    });
}
```

---

## 8. Frontend Components

### 8.1 Exploration Viewer

```
┌─────────────────────────────────────────────────────────┐
│  Exploring stellar-vault.app...                         │
│                                                         │
│  ┌─────────────────────────┐  Discovered Pages          │
│  │                         │                            │
│  │   [live screenshot      │  ✓ / — Landing page        │
│  │    swaps as agent       │  ✓ /vault — Deposit form   │
│  │    navigates pages]     │  ◉ /dashboard — Loading... │
│  │                         │  ○ /admin — Queued         │
│  │                         │                            │
│  └─────────────────────────┘                            │
│                                                         │
│  "Vault page with deposit input (data-testid=           │
│   deposit-input), Deposit button, and TVL display"      │
│                                                         │
│                              [Done — Start Chat →]      │
└─────────────────────────────────────────────────────────┘
```

### 8.2 Chat Window

```
┌─────────────────────────────────────────────────────────┐
│  Test Agent — Stellar Vault                             │
│─────────────────────────────────────────────────────────│
│                                                         │
│  You: Test that a user can deposit 100 XLM              │
│                                                         │
│  Agent: What should we assert after the deposit?        │
│  Options:                                               │
│  - Vault balance updates to 100                         │
│  - Success toast appears                                │
│  - Transaction hash is displayed                        │
│                                                         │
│  You: Assert vault balance shows 100                    │
│                                                         │
│  Agent: Generating test...                              │
│  ┌─────────────────────────────────────────────┐        │
│  │ import { test, expect } from '@playwright.. │        │
│  │ import { installMockStellarWallet } from .. │        │
│  │                                             │        │
│  │ test('deposit 100 XLM', async ({ page }) => │        │
│  │   await installMockStellarWallet(...)       │        │
│  │   await page.goto('/vault')                 │        │
│  │   await page.fill('[data-testid=...]', '100 │        │
│  │   ...                                       │        │
│  └─────────────────────────────────────────────┘        │
│                                                         │
│  [Run Test]                                             │
│─────────────────────────────────────────────────────────│
│  Type a message...                              [Send]  │
└─────────────────────────────────────────────────────────┘
```

### 8.3 Run Results

```
┌─────────────────────────────────────────────────────────┐
│  Test Run — Vault Deposit              PASSED ✓  12.3s  │
│─────────────────────────────────────────────────────────│
│                                                         │
│  Step 1: Navigate to /vault                    ✓ 1.2s  │
│  ┌──────────────────────┐                               │
│  │ [screenshot]         │                               │
│  └──────────────────────┘                               │
│                                                         │
│  Step 2: Fill deposit amount (100)             ✓ 0.3s  │
│  ┌──────────────────────┐                               │
│  │ [screenshot]         │                               │
│  └──────────────────────┘                               │
│                                                         │
│  Step 3: Click Deposit                         ✓ 0.5s  │
│  ┌──────────────────────┐                               │
│  │ [screenshot]         │                               │
│  └──────────────────────┘                               │
│                                                         │
│  Step 4: Assert vault balance = 100            ✓ 8.1s  │
│  ┌──────────────────────┐                               │
│  │ [screenshot]         │                               │
│  └──────────────────────┘                               │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 9. Demo Flow (Hackathon Pitch)

```
Step 1 (10 seconds)
    "I have a Stellar dApp at stellar-vault.app"
    → Enter URL, click Explore
    → Screenshots stream in, pages discovered live

Step 2 (20 seconds)
    "Test that a user can deposit 100 XLM into the vault"
    → Agent asks: "What should we assert?"
    → User: "Vault balance shows 100"
    → Agent generates Playwright test code

Step 3 (15 seconds)
    → Click Run
    → Step-by-step screenshots stream in
    → Test passes ✓

Step 4 (pitch)
    "Passing runs are zero LLM cost — just static Playwright.
     When UI changes break a test, the agent self-heals.
     Multi-persona testing: Admin pauses vault, User can't deposit.
     Scheduled runs with failure classification.
     All from a URL — no source code needed."
```

**Total demo time: ~45 seconds of live product, ~60 seconds of pitch.**

---

## 10. Key Dependencies (MVP)

| Package | Purpose |
|---------|---------|
| `next` (14+) | App framework |
| `@anthropic-ai/sdk` | Claude API |
| `playwright` | Browser automation (exploration) |
| `@playwright/test` | Test execution (runner) |
| `stellar-wallet-mock` | Wallet mocking for Stellar dApps |
| `@supabase/supabase-js` | DB + auth + storage |
| `tailwindcss` + `shadcn/ui` | UI |

**7 dependencies.** No Redis, no BullMQ, no ioredis, no Fly SDK, no OpenAI, no Gemini.

---

## 11. Environment Variables

```env
# .env.local
ANTHROPIC_API_KEY=sk-ant-...
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

**4 environment variables.** No Redis URL, no Fly token, no OpenAI key, no encryption keys.

---

## 12. Post-Hackathon Roadmap

These are scoped out of MVP but designed-for in the full architecture:

1. **Multi-persona** — multiple wallets per project, role-specific exploration
2. **Scheduled runs** — BullMQ + Redis cron
3. **Fly Machines** — isolated VM execution
4. **Failure analysis** — agent classifies failures, self-heals broken selectors
5. **Multi-provider LLM** — swap Claude for GPT-4 or Gemini
6. **Notifications** — email, Slack, webhook on failure
7. **Teams** — multi-user accounts with RBAC
8. **Metering + billing** — usage tracking, plan limits
