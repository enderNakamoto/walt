# Phase 14 — Smart Wait Strategy

## Goal

Generated tests should handle React timing correctly — waiting for hydration, loading spinners, skeleton screens, and dynamic content updates — instead of using brittle `waitForTimeout` or failing on elements that haven't rendered yet.

## Current Problem

Generated tests use:
- `await page.waitForTimeout(5000)` — arbitrary, either too long or too short
- Direct `textContent()` calls on elements that may not exist yet — crashes
- No handling of loading states — the page may show a spinner when the test tries to interact
- No retry logic for stale values — checking TVL right after a transaction may show the old value

## What Changes

### 1. Wait Utilities Library

A reusable utility file that gets included in every generated test:

```typescript
// wait-utils.ts (injected into test temp dir)

/** Wait for page to be fully loaded — no spinners, no skeletons, no pending fetches */
export async function waitForPageReady(page: Page, options?: { timeout?: number }) {
  const timeout = options?.timeout ?? 30_000;

  // Wait for network to settle (no pending XHR/fetch for 500ms)
  await page.waitForLoadState('networkidle', { timeout });

  // Wait for common loading indicators to disappear
  const loadingSelectors = [
    '[class*="spinner"]', '[class*="loading"]', '[class*="skeleton"]',
    '[role="progressbar"]', '[data-loading="true"]',
    '.animate-spin', '.animate-pulse',
  ];

  for (const selector of loadingSelectors) {
    const count = await page.locator(selector).count();
    if (count > 0) {
      await page.locator(selector).first().waitFor({ state: 'hidden', timeout });
    }
  }
}

/** Wait for an element's text to change from its current value */
export async function waitForValueChange(
  page: Page,
  selector: string,
  currentValue: string,
  options?: { timeout?: number },
) {
  const timeout = options?.timeout ?? 60_000;
  await page.waitForFunction(
    ({ sel, val }) => {
      const el = document.querySelector(sel);
      return el && el.textContent?.trim() !== val;
    },
    { sel: selector, val: currentValue },
    { timeout },
  );
}

/** Wait for element to exist and have non-empty text, with retry */
export async function waitForTextContent(
  page: Page,
  selector: string,
  options?: { timeout?: number },
): Promise<string> {
  const timeout = options?.timeout ?? 30_000;
  const locator = page.locator(selector);
  await locator.waitFor({ state: 'visible', timeout });

  // Retry until text is non-empty (React may render empty then fill)
  const text = await locator.textContent({ timeout });
  if (!text?.trim()) {
    await page.waitForFunction(
      (sel) => {
        const el = document.querySelector(sel);
        return el && el.textContent?.trim();
      },
      selector,
      { timeout: 5_000 },
    );
    return (await locator.textContent()) ?? '';
  }
  return text;
}

/** Click with auto-retry — handles elements that re-render during React updates */
export async function safeClick(page: Page, selector: string, options?: { timeout?: number }) {
  const timeout = options?.timeout ?? 15_000;
  const locator = page.locator(selector);
  await locator.waitFor({ state: 'visible', timeout });
  await locator.scrollIntoViewIfNeeded();
  await locator.click({ timeout });
}

/** Fill input with retry — handles React controlled inputs */
export async function safeFill(page: Page, selector: string, value: string, options?: { timeout?: number }) {
  const timeout = options?.timeout ?? 15_000;
  const locator = page.locator(selector);
  await locator.waitFor({ state: 'visible', timeout });
  await locator.click();
  await locator.fill(value);
  // Verify the value was set (React may override)
  await page.waitForFunction(
    ({ sel, val }) => {
      const input = document.querySelector(sel) as HTMLInputElement;
      return input && input.value === val;
    },
    { sel: selector, val: value },
    { timeout: 5_000 },
  );
}

/** Wait for a Soroban transaction to complete — smart polling */
export async function waitForTransaction(page: Page, options?: {
  timeout?: number;
  successIndicator?: string;
}) {
  const timeout = options?.timeout ?? 60_000;

  // First wait for any loading/pending state
  await waitForPageReady(page, { timeout });

  // If a success indicator is provided, wait for it
  if (options?.successIndicator) {
    await page.locator(options.successIndicator).waitFor({ state: 'visible', timeout });
  }
}
```

### 2. Prompt Updates — Use Wait Utilities

Update the test generation rules in the system prompt:

```
## Test generation rules — timing
1. Import { waitForPageReady, waitForValueChange, safeClick, safeFill, waitForTransaction } from './wait-utils'
2. After EVERY page.goto(), call waitForPageReady(page) before interacting
3. After EVERY button click that triggers a transaction, call waitForTransaction(page, { successIndicator: '...' })
4. Use safeClick() and safeFill() instead of raw page.click() and page.fill()
5. To verify a value changed, use waitForValueChange() — never compare stale snapshots
6. NEVER use page.waitForTimeout() — always wait for a specific condition
```

### 3. Runner Injects Wait Utils

The runner writes `wait-utils.ts` alongside the test file in the temp directory so generated tests can import it.

## Files to Change

| File | Change |
|------|--------|
| `lib/wait-utils.ts` (NEW) | Wait utility functions source code (as a string constant for injection) |
| `lib/runner.ts` | Write `wait-utils.ts` to temp dir before running tests |
| `lib/agent/prompts.ts` | Add timing rules to system prompt |
| `lib/agent/tools.ts` | Update `generate_test` description to mention wait utilities |

## Subtasks

- [ ] Create `lib/wait-utils.ts` with all utility functions
- [ ] Update runner to inject wait-utils.ts into temp test directory
- [ ] Update system prompt with timing rules
- [ ] Update `generate_test` tool description
- [ ] Test: generated code should use smart waits instead of waitForTimeout
- [ ] Test: verify wait utilities work with sentinel-stellar-2 dApp
