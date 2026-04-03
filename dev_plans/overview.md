# WALT v2 — Intelligent Agent Upgrade

## Problem Statement

The current agent generates Playwright tests **blind** — it uses stale exploration data and guesses selectors/text patterns without verifying them against the live page. When tests fail, there's no feedback loop. The agent doesn't understand React timing, loading states, or dynamic content. Results data is minimal.

## Goals

1. **See before writing** — Agent screenshots target pages during conversation, extracts exact DOM state, writes selectors from live data
2. **Self-healing on failure** — When a test fails, the runner feeds the error + screenshot back to Claude, gets a fix, retries automatically
3. **React-aware timing** — Smart waits for hydration, loading spinners, skeleton screens, transitions — not arbitrary `waitForTimeout`
4. **Rich exploration data** — Extract full text content, DOM structure, computed styles, not just buttons/inputs/links
5. **Better results** — Screenshots at every action, console logs, network failures, DOM snapshots on error

## Phase Overview

| Phase | Name | What Changes |
|-------|------|-------------|
| 12 | Enhanced Exploration | Richer DOM extraction, full text content, CSS selectors, accessibility tree |
| 13 | Live Page Inspection | New `inspect_page` tool — agent screenshots + extracts DOM during conversation before generating code |
| 14 | Smart Wait Strategy | React-aware wait utilities, auto-detect loading states, retry-on-stale patterns in generated code |
| 15 | Self-Healing Runner | On failure: screenshot → Claude diagnosis → fix code → retry (up to 3 attempts) |
| 16 | Rich Test Results | Screenshots per action, console logs, network log, DOM snapshot on error, trace viewer link |
| 17 | Integration & Polish | E2E testing of the full loop, prompt refinement, UI updates for new data |

## Architecture Changes

```
BEFORE:
  Explore → stale selectors → Chat (guess selectors) → Generate → Run → fail silently

AFTER:
  Explore (rich DOM) → Chat (inspect live pages) → Generate (verified selectors)
    → Run → fail → diagnose → fix → retry → pass
         ↑                                    |
         └────────────────────────────────────┘
                    self-healing loop
```

## Dependencies Between Phases

- Phase 12 (exploration) is independent — can start immediately
- Phase 13 (inspect) depends on Phase 12 for richer data format
- Phase 14 (smart waits) is independent — utility code
- Phase 15 (self-healing) depends on Phase 13 (inspect tool) + Phase 14 (smart waits)
- Phase 16 (rich results) is mostly independent, slight dependency on Phase 15
- Phase 17 (polish) depends on all previous phases
