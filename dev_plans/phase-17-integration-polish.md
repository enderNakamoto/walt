# Phase 17 — Integration & Polish

## Goal

Wire all new capabilities together, test the full loop end-to-end, refine prompts based on real results, and update the UI to showcase the intelligent agent workflow.

## What Changes

### 1. End-to-End Loop Testing

Test the complete flow with sentinel-stellar-2 dApp:
```
Explore (rich DOM data)
  → Chat (inspect pages live, ask success criteria per step)
    → Generate (verified selectors, smart waits)
      → Run → fail
        → Self-heal (diagnose, fix, retry)
          → Pass with rich results (screenshots, console, network)
```

### 2. Prompt Refinement

Based on testing results, refine:
- System prompt — what context is most useful for generating accurate selectors
- Healing diagnosis prompt — what information helps Claude fix tests most effectively
- Exploration page description prompt — what details matter most
- Success criteria questions — phrasing that gets actionable answers from users

### 3. UI Updates

#### Chat Page
- Show inspection screenshots inline when agent uses `inspect_page`
- Show "Inspecting page..." status with live screenshot
- Display extracted page data summary (what the agent sees)

#### Runs Page
- Healing attempt timeline (attempt 1 failed → attempt 2 fixed → passed)
- Visual diff between original and healed code
- Screenshot timeline with thumbnails
- Console/network panels (collapsible)
- Trace viewer link

#### Exploration Page
- Show richer data per page (text content, accessibility tree)
- Better page summary cards

### 4. Error Handling & Edge Cases

- Agent tries to inspect a page that's down → graceful error, suggest retry
- Test generates code with syntax errors → runner catches, reports clearly
- Healing loop exhausts all 3 attempts → clear failure report with all diagnoses
- Network timeout during test → distinguish from test logic failure
- Wallet mock fails to install → clear error message
- Multiple concurrent runs → proper isolation

### 5. Performance

- Exploration should cache aggressively — don't re-explore unless forced
- Inspection screenshots should be JPEG for speed
- Healing should have diminishing timeouts (attempt 1: 180s, attempt 2: 120s, attempt 3: 90s)
- Rich results data should lazy-load (don't send all screenshots in initial page render)

### 6. Demo Script

Update demo flow for hackathon pitch:
```
1. Enter dApp URL → Explore (rich data streams in)
2. "Test minting and depositing" → Agent inspects faucet page, asks success criteria
3. User answers → Agent inspects vault page, asks about deposit success
4. User answers → Agent generates test with verified selectors
5. Run → Test fails on a timing issue
6. Self-healing kicks in → diagnoses, fixes wait, retries
7. Test passes on attempt 2 → show rich results with screenshots at every step
8. Pitch: "Zero-cost passing runs. Self-healing on UI changes. Works on any dApp."
```

## Files to Change

| File | Change |
|------|--------|
| All agent files | Prompt refinement based on testing |
| `components/ChatWindow.tsx` | Inline inspection screenshots |
| `components/RunResults.tsx` | Healing timeline, screenshot timeline, console/network panels |
| `components/ExplorationViewer.tsx` | Richer page data display |
| `README.md` | Updated demo flow and feature list |
| `spec/progress.md` | Update with new phases |

## Subtasks

- [ ] Run full E2E test with sentinel-stellar-2 (explore → chat → generate → run → heal)
- [ ] Refine system prompt based on test results
- [ ] Refine healing prompt based on failure patterns
- [ ] Update ChatWindow to show inspection screenshots
- [ ] Update RunResults with healing timeline
- [ ] Update ExplorationViewer with richer data
- [ ] Handle edge cases (page down, syntax errors, concurrent runs)
- [ ] Performance tuning (caching, lazy loading, timeout scheduling)
- [ ] Update README with new features and demo flow
- [ ] Update progress.md with phases 12-17
- [ ] Final demo rehearsal
