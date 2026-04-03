export const WAIT_UTILS_SOURCE = `
import { Page, Locator, expect } from '@playwright/test';

type SelectorOrLocator = string | Locator;

function toLoc(page: Page, sel: SelectorOrLocator): Locator {
  return typeof sel === 'string' ? page.locator(sel) : sel;
}

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
  selector: SelectorOrLocator,
  currentValue: string,
  options?: { timeout?: number },
) {
  const timeout = options?.timeout ?? 60_000;
  const loc = toLoc(page, selector);
  await expect(loc).not.toHaveText(currentValue, { timeout });
}

/** Click with auto-wait for visibility and scroll into view */
export async function safeClick(page: Page, selector: SelectorOrLocator, options?: { timeout?: number }) {
  const timeout = options?.timeout ?? 30_000;
  const loc = toLoc(page, selector);
  await loc.waitFor({ state: 'visible', timeout });
  await loc.scrollIntoViewIfNeeded();
  await loc.click({ timeout });
}

/** Fill input with verification — handles React controlled inputs */
export async function safeFill(page: Page, selector: SelectorOrLocator, value: string, options?: { timeout?: number }) {
  const timeout = options?.timeout ?? 30_000;
  const loc = toLoc(page, selector);
  await loc.waitFor({ state: 'visible', timeout });
  await loc.click();
  await loc.clear();
  await loc.fill(value);

  // Brief wait for React state update
  await page.waitForTimeout(300);
}

/** Get text content with retry — waits for element to have non-empty text */
export async function safeTextContent(page: Page, selector: SelectorOrLocator, options?: { timeout?: number }): Promise<string> {
  const timeout = options?.timeout ?? 30_000;
  const loc = toLoc(page, selector);
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
  // Find all number-like patterns in the text (e.g. "170,000.00" or "4512.00")
  const matches = text.match(/[\\d,]+\\.?\\d*/g);
  if (!matches || matches.length === 0) return 0;
  // Return the largest number found — usually the value, not a small number from a label
  let largest = 0;
  for (const m of matches) {
    const val = parseFloat(m.replace(/,/g, ''));
    if (!isNaN(val) && val > largest) largest = val;
  }
  return largest;
}

/** Read a numeric value displayed near a label on the page.
 *  Finds the element containing the label text and reads the full container's text,
 *  then extracts the number. This handles the common pattern where "Label:" and "Value"
 *  are separate DOM elements but share a parent container.
 *  Example: readValueNear(page, "Your USDC Balance") → 170000 */
export async function readValueNear(page: Page, labelText: string, options?: { timeout?: number }): Promise<number> {
  const timeout = options?.timeout ?? 30_000;

  // Strategy 1: Find element containing the label, get parent's full text
  const container = page.locator(\`:has-text("\${labelText}")\`).first();
  await container.waitFor({ state: 'visible', timeout });
  const fullText = await container.textContent() ?? '';
  const value = parseNumber(fullText);
  if (value > 0) return value;

  // Strategy 2: Get the parent element's text (go up one level)
  const parent = container.locator('..');
  const parentText = await parent.textContent() ?? '';
  const parentValue = parseNumber(parentText);
  if (parentValue > 0) return parentValue;

  // Strategy 3: Find sibling elements
  const siblings = parent.locator('span, strong, p, div');
  const count = await siblings.count();
  for (let i = 0; i < count; i++) {
    const sibText = await siblings.nth(i).textContent() ?? '';
    const sibVal = parseNumber(sibText);
    if (sibVal > 0) return sibVal;
  }

  return 0;
}
`;
