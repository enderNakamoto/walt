export const WAIT_UTILS_SOURCE = `
import { Page, expect } from '@playwright/test';

/** Wait for page to be fully loaded — no spinners, no skeletons */
export async function waitForPageReady(page: Page, options?: { timeout?: number }) {
  const timeout = options?.timeout ?? 30_000;
  await page.waitForLoadState('domcontentloaded', { timeout });

  // Wait for common loading indicators to disappear
  const loadingSelectors = [
    '.animate-spin', '.animate-pulse',
    '[class*="spinner"]', '[class*="loading"]', '[class*="skeleton"]',
    '[role="progressbar"]', '[data-loading="true"]',
  ];

  for (const selector of loadingSelectors) {
    const count = await page.locator(selector).count();
    if (count > 0) {
      try {
        await page.locator(selector).first().waitFor({ state: 'hidden', timeout: 10_000 });
      } catch {
        // Loading indicator may have already disappeared
      }
    }
  }

  // Brief settle for React hydration
  await page.waitForTimeout(500);
}

/** Wait for an element's text to change from its current value */
export async function waitForValueChange(
  page: Page,
  locator: string,
  currentValue: string,
  options?: { timeout?: number },
) {
  const timeout = options?.timeout ?? 60_000;
  await page.waitForFunction(
    ({ sel, val }) => {
      const el = document.querySelector(sel);
      return el && el.textContent?.trim() !== val;
    },
    { sel: locator, val: currentValue },
    { timeout },
  );
}

/** Click with auto-wait for visibility and scroll into view */
export async function safeClick(page: Page, locator: string, options?: { timeout?: number }) {
  const timeout = options?.timeout ?? 30_000;
  const loc = page.locator(locator);
  await loc.waitFor({ state: 'visible', timeout });
  await loc.scrollIntoViewIfNeeded();
  await loc.click({ timeout });
}

/** Fill input with verification — handles React controlled inputs */
export async function safeFill(page: Page, locator: string, value: string, options?: { timeout?: number }) {
  const timeout = options?.timeout ?? 30_000;
  const loc = page.locator(locator);
  await loc.waitFor({ state: 'visible', timeout });
  await loc.click();
  await loc.clear();
  await loc.fill(value);

  // Brief wait for React state update
  await page.waitForTimeout(300);
}

/** Get text content with retry — waits for element to have non-empty text */
export async function safeTextContent(page: Page, locator: string, options?: { timeout?: number }): Promise<string> {
  const timeout = options?.timeout ?? 30_000;
  const loc = page.locator(locator);
  await loc.waitFor({ state: 'visible', timeout });

  // Wait for non-empty text
  await expect(loc).not.toHaveText('', { timeout: 10_000 });
  return (await loc.textContent()) ?? '';
}

/** Wait for a transaction to complete — watches for loading to finish and page to update */
export async function waitForTransaction(page: Page, options?: {
  timeout?: number;
  successIndicator?: string;
  failureIndicator?: string;
}) {
  const timeout = options?.timeout ?? 90_000;

  // Wait for any loading state to appear then disappear
  await waitForPageReady(page, { timeout });

  // If a success indicator is provided, wait for it
  if (options?.successIndicator) {
    await page.locator(options.successIndicator).waitFor({ state: 'visible', timeout });
  }
}

/** Parse a numeric value from text, handling commas, currency symbols, etc. */
export function parseNumber(text: string): number {
  const cleaned = text.replace(/[^\\d.,-]/g, '').replace(/,/g, '');
  return parseFloat(cleaned) || 0;
}
`;
