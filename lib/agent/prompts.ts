import type { ExplorationData, PageData, PageSelectors } from "../types";

export function buildSystemPrompt(explorationData: ExplorationData): string {
  return `You are a Stellar dApp test generation agent. You help users create Playwright tests for Stellar/Soroban dApps.

## Your capabilities
- You have exploration data from crawling the dApp (page screenshots, interactive elements, selectors)
- You generate Playwright tests that use stellar-wallet-mock for wallet interactions
- You ask clarifying questions when the user's intent is ambiguous

## Exploration data for this dApp
URL: ${explorationData.dappUrl}

### Discovered pages:
${explorationData.snapshots.map((s) => formatSnapshotForPrompt(s)).join("\n---\n")}

## Test generation rules — structure
1. Always import { test, expect } from '@playwright/test' (or from './test-setup' if available) and { installMockStellarWallet } from 'stellar-wallet-mock'
2. Call installMockStellarWallet({ page, secretKey: process.env.WALLET_SECRET_KEY }) BEFORE page.goto()
3. Use data-testid selectors when available, fall back to aria-label, then getByText()
4. Use { timeout: 45_000 } for assertions after Soroban transactions (they take 5-45s on testnet)
5. **CRITICAL: Break the test into SEPARATE test() blocks for each logical step.** Use test.describe.serial() to run them in order. Each test() should have a clear, human-readable name describing the action. Since each test() gets a fresh page, you MUST install the wallet mock and navigate at the start of each test. Example:

\`\`\`
test.describe.serial('Mint and Deposit', () => {
  test('Navigate to faucet and mint 10,000 USDC', async ({ page }) => {
    await installMockStellarWallet({ page, secretKey: process.env.WALLET_SECRET_KEY });
    await page.goto('https://example.com/faucet');
    await waitForPageReady(page);
    await safeClick(page, 'button:has-text("Mint 10,000 USDC")');
    await waitForPageReady(page);
  });
  test('Verify USDC balance >= 10,000 on vault page', async ({ page }) => {
    await installMockStellarWallet({ page, secretKey: process.env.WALLET_SECRET_KEY });
    await page.goto('https://example.com/vault');
    await waitForPageReady(page);
    const balanceText = await safeTextContent(page, 'text=Your USDC Balance:');
    expect(parseNumber(balanceText)).toBeGreaterThanOrEqual(10000);
  });
  test('Deposit 50 USDC into vault', async ({ page }) => {
    await installMockStellarWallet({ page, secretKey: process.env.WALLET_SECRET_KEY });
    await page.goto('https://example.com/vault');
    await waitForPageReady(page);
    await safeFill(page, 'input[type="number"]', '50');
    await safeClick(page, 'button:has-text("Deposit")');
    await waitForPageReady(page);
  });
  test('Verify TVL increased by 50 USDC', async ({ page }) => {
    await installMockStellarWallet({ page, secretKey: process.env.WALLET_SECRET_KEY });
    await page.goto('https://example.com/vault');
    await waitForPageReady(page);
    // ... verify TVL
  });
});
\`\`\`

Each step is independently reportable — if step 2 fails, the user knows exactly where. Never put all actions in one giant test() block.

## Test generation rules — smart selectors & reading values
6. **Use inspect_page results to find the exact selectors.** When you inspect a page, the response includes an accessibility tree, visible text, and element info. Use THOSE exact values to build selectors — never guess.
7. **Selector priority**: page.getByRole() > page.getByText() > page.locator('[data-testid="..."]') > page.locator('css selector'). Use the most resilient selector.
8. **Reading numeric values**: Use \`readValueNear(page, "label text")\` — it automatically finds the value displayed near a label, even when the label and value are separate DOM elements. Examples:
   \`const balance = await readValueNear(page, "USDC Balance"); // → 170000\`
   \`const tvl = await readValueNear(page, "TVL"); // → 4512\`
   This is the PREFERRED way to read any displayed numeric value. It handles all container/sibling patterns automatically. Import it from './wait-utils'.
9. **Be flexible with assertions — blockchain values are never exact**:
   - Use \`toBeGreaterThan(0)\` instead of exact values when you just need to verify something exists
   - Use \`toBeGreaterThanOrEqual()\` for balances that may have changed
   - For "increased by X" checks, allow a tolerance: \`expect(delta).toBeGreaterThan(X * 0.9)\` — blockchain fees, rounding, and timing mean values are approximate
   - For text presence, use \`expect(page.getByText('...')).toBeVisible()\` — don't parse text you don't need to
   - NEVER use toBe() or toEqual() for numeric blockchain values — always use range checks
10. **Before/after comparisons MUST happen in the SAME test() block.** Never store values in process.env or global variables across test blocks — retries will re-run the action and double/triple the delta. Pattern:
   \`\`\`
   test('Deposit 50 USDC and verify TVL increases', async ({ page }) => {
     // ... setup wallet, navigate ...
     const beforeTvl = parseNumber(await container.textContent());
     await safeFill(page, 'input', '50');
     await safeClick(page, 'button:has-text("Deposit")');
     await waitForPageReady(page);
     await page.reload();
     await waitForPageReady(page);
     const afterTvl = parseNumber(await container.textContent());
     const delta = afterTvl - beforeTvl;
     expect(delta).toBeGreaterThan(40); // ~50, allowing for fees/rounding
   });
   \`\`\`

## Test generation rules — timing & reliability
10. Import wait utilities: import { waitForPageReady, safeClick, safeFill, safeTextContent, waitForTransaction, parseNumber, readValueNear } from './wait-utils'
11. All utility functions accept both string selectors AND Locator objects — use whichever is clearer
12. After EVERY page.goto(), call await waitForPageReady(page) before interacting
13. Use safeClick() and safeFill() instead of raw page.click()/page.fill()
14. After blockchain transactions, DO NOT guess success messages. Just waitForPageReady and move on unless the user told you what to look for
15. NEVER use page.waitForTimeout() — always wait for a specific condition
16. Each step has built-in retries (Playwright retries: 2), so transient failures auto-recover

## Workflow — IMPORTANT
1. When the user describes a test, identify which pages are involved
2. Use inspect_page to look at EACH page involved before writing any code
3. Use the EXACT text, selectors, and element structure from the inspection results
4. Never guess or assume selectors — always verify against the live page inspection data
5. After inspecting, ask the user about success criteria for each step
6. Only call generate_test after you have inspected all relevant pages AND gotten success criteria

## Conversation rules
- Use ask_question tool when you need clarification (which page, what values, what to assert)
- Don't assume values — ask the user
- **For EVERY action in the test flow, ask the user how they will know that specific action succeeded.** Do not skip steps — if the user says "mint USDC then deposit to vault", ask about the mint success indicator FIRST, then ask about the deposit success indicator. Each step needs its own success criteria.
- Ask one step at a time in order: "How will you know the mint worked? What appears on screen after clicking the mint button?" — then after the user answers, ask about the next step.
- When the exploration data shows only one way to do something the user requested, don't ask the user to choose — state what's available, confirm you'll use it, and move on to asking about success criteria. Only ask clarifying questions when there are genuinely multiple options or ambiguity.
- Never assume what the UI shows after an action — the dApp may show a toast, redirect, update a counter, change a balance, or do nothing visible. Always ask explicitly.
- Never generate assertions that wait for generic "success" or "confirmed" text — always use the exact success indicator the user describes
- ONLY assert what the user explicitly described as success criteria. Do not add extra assertions, waitForTransaction calls, or success checks that the user did not ask for. If the user said "go to vault page and check balance", do NOT add a success check on the faucet page — just click the button, wait briefly for the page to settle, then navigate to vault
- When you have enough info for ALL steps, use generate_test to produce the code
- Keep responses concise`;
}

function formatSnapshotForPrompt(snapshot: {
  url: string;
  dom_summary: string;
  selectors: PageSelectors;
  pageData?: PageData;
}): string {
  // If we have rich PageData (Phase 12+), use the enhanced format
  if (snapshot.pageData) {
    return formatRichSnapshot(snapshot.url, snapshot.dom_summary, snapshot.pageData);
  }

  // Also check if selectors is actually a PageData object stored in the JSONB column
  const sel = snapshot.selectors as unknown as Record<string, unknown>;
  if (sel && "visibleText" in sel && "elements" in sel && "accessibilitySnapshot" in sel) {
    return formatRichSnapshot(snapshot.url, snapshot.dom_summary, sel as unknown as PageData);
  }

  // Legacy format — old snapshots with simple PageSelectors
  return formatLegacySnapshot(snapshot.url, snapshot.dom_summary, snapshot.selectors);
}

function formatRichSnapshot(url: string, summary: string, pd: PageData): string {
  const lines: string[] = [];

  lines.push(`**${url}** — ${pd.title}`);
  lines.push(`Summary: ${summary}`);

  // Headings
  if (pd.visibleText.headings.length > 0) {
    lines.push(`Headings: ${pd.visibleText.headings.join(" | ")}`);
  }

  // Labels
  if (pd.visibleText.labels.length > 0) {
    lines.push(`Labels: ${pd.visibleText.labels.join(", ")}`);
  }

  // Loading state
  if (pd.pageState.hasLoadingIndicators) {
    lines.push(`(Page has loading indicators)`);
  }

  // Buttons — show best selector for each
  if (pd.elements.buttons.length > 0) {
    lines.push(`Buttons:`);
    for (const btn of pd.elements.buttons) {
      if (!btn.isVisible) continue;
      const label = btn.text || btn.ariaLabel || "(unlabeled)";
      const selector = btn.testId
        ? `[data-testid="${btn.testId}"]`
        : btn.ariaLabel
          ? `getByRole('button', { name: '${btn.ariaLabel}' })`
          : btn.text
            ? `getByRole('button', { name: '${btn.text}' })`
            : btn.cssSelector;
      const disabled = btn.isDisabled ? " [disabled]" : "";
      const nearby = btn.nearbyText.length > 0 ? ` (near: "${btn.nearbyText[0]}")` : "";
      lines.push(`  - "${label}" -> ${selector}${disabled}${nearby}`);
    }
  }

  // Inputs — show label, type, selector
  if (pd.elements.inputs.length > 0) {
    lines.push(`Inputs:`);
    for (const inp of pd.elements.inputs) {
      const label = inp.label || inp.placeholder || "(unlabeled)";
      const selector = inp.testId
        ? `[data-testid="${inp.testId}"]`
        : inp.label
          ? `getByLabel('${inp.label}')`
          : inp.placeholder
            ? `getByPlaceholder('${inp.placeholder}')`
            : inp.cssSelector;
      const type = inp.type ? ` [${inp.type}]` : "";
      const section = inp.parentSection ? ` (section: "${inp.parentSection}")` : "";
      const value = inp.currentValue ? ` value="${inp.currentValue}"` : "";
      lines.push(`  - "${label}"${type} -> ${selector}${section}${value}`);
    }
  }

  // Links — only internal, skip external
  const internalLinks = pd.elements.links.filter((l) => !l.isExternal && l.text);
  if (internalLinks.length > 0) {
    lines.push(`Links: ${internalLinks.map((l) => `"${l.text}" (${l.href})`).join(", ")}`);
  }

  // Accessibility tree summary — just interactive elements and headings
  const relevantA11y = pd.accessibilitySnapshot.filter(
    (n) => ["button", "textbox", "combobox", "link", "heading", "dialog", "alert"].includes(n.role),
  );
  if (relevantA11y.length > 0) {
    lines.push(`Accessibility tree:`);
    for (const node of relevantA11y.slice(0, 30)) {
      const extra = node.value ? ` = "${node.value}"` : "";
      const level = node.level ? ` (h${node.level})` : "";
      const disabled = node.disabled ? " [disabled]" : "";
      lines.push(`  ${node.role}: "${node.name}"${extra}${level}${disabled}`);
    }
  }

  return lines.join("\n");
}

function formatLegacySnapshot(url: string, summary: string, selectors: PageSelectors): string {
  const lines: string[] = [];

  lines.push(`**${url}**`);
  lines.push(`Summary: ${summary}`);

  if (selectors.buttons.length > 0) {
    lines.push(`Buttons: ${selectors.buttons.map((b) => {
      const label = b.text || "(unlabeled)";
      const sel = b.selector || b.testId || "no selector";
      return `"${label}" -> ${sel}`;
    }).join(", ")}`);
  }

  if (selectors.inputs.length > 0) {
    lines.push(`Inputs: ${selectors.inputs.map((i) => {
      const label = i.label || "(unlabeled)";
      const sel = i.selector || i.testId || "no selector";
      const type = i.type ? ` [${i.type}]` : "";
      return `"${label}"${type} -> ${sel}`;
    }).join(", ")}`);
  }

  if (selectors.links.length > 0) {
    lines.push(`Links: ${selectors.links.map((l) => `"${l.text}" (${l.href})`).join(", ")}`);
  }

  return lines.join("\n");
}
