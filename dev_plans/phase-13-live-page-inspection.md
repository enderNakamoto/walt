# Phase 13 — Live Page Inspection During Conversation

## Goal

Before generating test code, the agent should **look at the actual pages** involved in the test, extract the exact current DOM state, and use that to write precise selectors — not guess from stale exploration data.

## Current Problem

The conversation agent has `navigate_and_screenshot` tool but:
1. It launches a fresh browser (no wallet mock) — sees a different UI than the test will
2. It only returns a screenshot (image) — no DOM data
3. The agent rarely uses it — it jumps straight to generating code from exploration data
4. The exploration data may be hours/days old

## What Changes

### 1. New `inspect_page` Tool

Replaces `navigate_and_screenshot`. Uses a **persistent browser session** with wallet mock installed (matching what the test will see). Returns both screenshot AND full DOM data.

```typescript
{
  name: "inspect_page",
  description: "Navigate to a page and inspect its current state. Returns a screenshot and full DOM data including all visible text, interactive elements with their exact selectors, and page state. Use this BEFORE generating test code to verify what the page actually shows.",
  input_schema: {
    type: "object",
    properties: {
      url: { type: "string", description: "URL to inspect" },
      waitFor: { type: "string", description: "Optional CSS selector to wait for before inspecting (e.g. 'h1', '.vault-stats')" },
    },
    required: ["url"],
  },
}
```

**Returns:**
```typescript
{
  screenshot: "data:image/jpeg;base64,...",
  pageData: {
    url: "https://sentinel-stellar-2.vercel.app/vault",
    title: "Underwriter Vault",
    visibleText: { headings: [...], labels: [...], values: [...] },
    elements: { buttons: [...], inputs: [...], links: [...] },
    accessibilityTree: [...],
    pageState: { hasLoadingIndicators: false, ... },
  }
}
```

### 2. Persistent Browser Session for Conversation

Instead of launching a new browser per tool call, maintain a browser session for the duration of the conversation round. This means:
- Wallet mock is installed once
- Navigation state persists between inspect calls
- Agent can inspect page A, then page B, then reference both
- Session closes when the conversation round ends

### 3. Prompt Changes — Require Inspection

Update the system prompt to **require** the agent to inspect pages before generating code:

```
## Workflow
1. When the user describes a test, identify which pages are involved
2. Use inspect_page to look at EACH page before writing any code
3. Use the EXACT text, selectors, and structure from the inspection results
4. Never guess selectors — always verify against live page data
5. Ask the user about success criteria for each step
6. Only then call generate_test with verified selectors
```

### 4. Remove `navigate_and_screenshot` Tool

Replace entirely with `inspect_page`. The old tool launched a fresh browser per call and returned no DOM data.

## Files to Change

| File | Change |
|------|--------|
| `lib/agent/tools.ts` | Replace `navigate_and_screenshot` with `inspect_page`, add `extractPageData` call |
| `lib/agent/conversation.ts` | Add persistent browser session management (open on first inspect, close in finally) |
| `lib/agent/prompts.ts` | Add workflow section requiring inspection before generation |
| `lib/types.ts` | Add `InspectionResult` type |

## Subtasks

- [ ] Create persistent browser session manager in conversation engine
- [ ] Implement `inspect_page` tool with full DOM extraction
- [ ] Wire wallet mock into conversation browser session
- [ ] Update system prompt with inspection-first workflow
- [ ] Remove `navigate_and_screenshot` tool
- [ ] Stream inspection screenshots to frontend via SSE
- [ ] Test: agent should inspect pages before generating code
