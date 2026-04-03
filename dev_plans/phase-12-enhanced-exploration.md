# Phase 12 — Enhanced Exploration

## Goal

Make the explorer extract **much richer data** from each page so the conversation agent has accurate, detailed context to write selectors from — not guesses.

## Current Problem

The explorer extracts:
- Button text + `data-testid` + `aria-label`
- Input label + `data-testid` + type
- Link text + href

This misses: visible text content, headings, numeric values, table data, status indicators, CSS classes, parent-child relationships, form labels, loading states.

## What Changes

### 1. Full Text Content Extraction

Extract all visible text on the page, grouped by semantic sections:
```typescript
{
  headings: ["Underwriter Vault", "Deposit", "Your Position"],
  labels: ["Your USDC Balance:", "TVL", "APY", "Amount (USDC)"],
  values: ["19,380.00 USDC", "$4,512.00 USDC", "1.8%"],
  paragraphs: ["Deposit USDC to back flight delay claims..."],
}
```

### 2. Element Context Extraction

For each interactive element, extract surrounding context:
```typescript
{
  buttons: [{
    text: "Deposit",
    testId: null,
    ariaLabel: null,
    cssSelector: "button.bg-blue-600",
    parentText: "Deposit | Amount (USDC)",  // what section is this button in
    nearbyText: ["Amount (USDC)", "0.00", "You'll receive 0.00 shares"],
    isDisabled: false,
    isVisible: true,
  }],
  inputs: [{
    placeholder: "0.00",
    label: "Amount (USDC)",
    type: "number",
    testId: null,
    cssSelector: "input[type='number']",
    currentValue: "",
    parentSection: "Deposit",
  }]
}
```

### 3. Page State Detection

Detect if the page is still loading:
```typescript
{
  hasLoadingIndicators: false,
  skeletonScreens: 0,
  pendingNetworkRequests: 0,
  readyState: "complete",
}
```

### 4. Accessibility Tree Snapshot

Extract a simplified accessibility tree for robust selector generation:
```typescript
{
  accessibilityTree: [
    { role: "heading", name: "Underwriter Vault", level: 1 },
    { role: "text", name: "Your USDC Balance: 19,380.00 USDC" },
    { role: "button", name: "Mint 10,000 USDC", disabled: false },
    { role: "textbox", name: "Amount (USDC)", value: "" },
    { role: "button", name: "Deposit", disabled: false },
  ]
}
```

## Files to Change

| File | Change |
|------|--------|
| `lib/agent/explorer.ts` | Rewrite `extractSelectors()` → `extractPageData()` with all new extractors |
| `lib/types.ts` | New `PageData` interface replacing the simple selectors type |
| `lib/agent/prompts.ts` | Update system prompt to include richer data format |
| `supabase/schema.sql` | `exploration_snapshots.selectors` already JSONB — schema unchanged, just richer data |

## Subtasks

- [ ] Define `PageData` interface in `lib/types.ts`
- [ ] Implement `extractPageData(page)` — full text, element context, state detection
- [ ] Implement `extractAccessibilityTree(page)` — simplified a11y snapshot
- [ ] Update `explore()` to use new extractors
- [ ] Update `describeScreenshot()` prompt to include richer context
- [ ] Update system prompt builder to format new data
- [ ] Test with sentinel-stellar-2 dApp
