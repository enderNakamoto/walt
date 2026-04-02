# stellar-wallet-mock — Examples

All examples assume the fixture pattern from SKILL.md Layer 1.

## Connect Wallet

The simplest test — navigate and confirm the wallet connected. The mock pre-seeds localStorage, so the dApp boots directly into a connected state.

```typescript
// tests/connect.spec.ts
import { test, expect, PUBLIC_KEY } from "./fixtures";

test("wallet connects and shows address", async ({ page }) => {
  await page.goto("http://localhost:5173");
  await expect(page.getByText(PUBLIC_KEY.slice(0, 5))).toBeVisible({
    timeout: 15_000,
  });
});
```

## Sign a Transaction (Counter Increment)

Clicking a button that triggers a Soroban transaction. The mock intercepts `SUBMIT_TRANSACTION` and signs in Node.js — no popup, no manual approval.

```typescript
// tests/counter.spec.ts
import { test, expect, PUBLIC_KEY } from "./fixtures";

test("counter increment signs and updates count", async ({ page }) => {
  await page.goto("http://localhost:5173");

  await expect(page.getByText(PUBLIC_KEY.slice(0, 5))).toBeVisible({
    timeout: 15_000,
  });

  const incrementBtn = page.getByTestId("increment-btn");
  await expect(incrementBtn).toBeEnabled({ timeout: 5_000 });
  await incrementBtn.click();

  const counterValue = page.getByTestId("counter-value");
  await expect(counterValue).not.toContainText("—", { timeout: 45_000 });

  const text = await counterValue.textContent();
  const match = text?.match(/(\d+)/);
  expect(match).toBeTruthy();
  expect(Number(match![1])).toBeGreaterThan(0);
});
```

## Vault Deposit (Auth Entry Signing)

Depositing into an ERC-4626 vault requires `require_auth()` for both token transfer and vault interaction — the mock signs Soroban auth entries via `SUBMIT_AUTH_ENTRY` automatically.

```typescript
// tests/vault-deposit.spec.ts
import { test, expect, PUBLIC_KEY } from "./fixtures";

test("deposit XLM into vault and receive shares", async ({ page }) => {
  await page.goto("http://localhost:5173");

  await expect(page.getByText(PUBLIC_KEY.slice(0, 5))).toBeVisible({
    timeout: 15_000,
  });

  const depositInput = page.getByTestId("deposit-input");
  await expect(depositInput).toBeVisible({ timeout: 5_000 });
  await depositInput.fill("1");

  const depositBtn = page.getByTestId("deposit-btn");
  await expect(depositBtn).toBeEnabled();
  await depositBtn.click();

  const sharesMinted = page.getByTestId("shares-minted");
  await expect(sharesMinted).toBeVisible({ timeout: 45_000 });
  const text = await sharesMinted.textContent();
  const match = text?.match(/([\d.]+)/);
  expect(match).toBeTruthy();
  expect(Number(match![1])).toBeGreaterThan(0);
});
```

## Vault Withdraw

After depositing, withdraw and verify the vault balance decreases. Also uses auth entry signing.

```typescript
// tests/vault-withdraw.spec.ts
import { test, expect, PUBLIC_KEY } from "./fixtures";

test("withdraw XLM from vault", async ({ page }) => {
  await page.goto("http://localhost:5173");

  await expect(page.getByText(PUBLIC_KEY.slice(0, 5))).toBeVisible({
    timeout: 15_000,
  });

  const refreshBtn = page.getByTestId("refresh-balance-btn");
  await expect(refreshBtn).toBeVisible({ timeout: 5_000 });
  await refreshBtn.click();

  const vaultBalance = page.getByTestId("vault-balance");
  await expect(vaultBalance).toContainText("XLM", { timeout: 15_000 });

  const beforeText = await vaultBalance.textContent();
  const beforeMatch = beforeText?.match(/([\d.]+)\s*XLM/);
  const beforeBalance = beforeMatch ? Number(beforeMatch[1]) : 0;

  const withdrawInput = page.getByTestId("withdraw-input");
  await expect(withdrawInput).toBeVisible({ timeout: 5_000 });
  await withdrawInput.fill("0.5");

  const withdrawBtn = page.getByTestId("withdraw-btn");
  await expect(withdrawBtn).toBeEnabled();
  await withdrawBtn.click();

  await expect(async () => {
    const afterText = await vaultBalance.textContent();
    const afterMatch = afterText?.match(/([\d.]+)\s*XLM/);
    const afterBalance = afterMatch ? Number(afterMatch[1]) : 0;
    expect(afterBalance).toBeLessThan(beforeBalance);
  }).toPass({ timeout: 45_000 });
});
```

## Read-Only Contract Calls

Reading contract state doesn't need signing, but the mock still needs to be installed so the dApp boots into a connected state.

```typescript
// tests/read-only.spec.ts
import { test, expect } from "./fixtures";

test("read counter value without signing", async ({ page }) => {
  await page.goto("http://localhost:5173");

  const getCountBtn = page.getByTestId("get-count-btn");
  await expect(getCountBtn).toBeVisible({ timeout: 10_000 });
  await getCountBtn.click();

  const counterValue = page.getByTestId("counter-value");
  await expect(counterValue).toContainText(/\d+/, { timeout: 15_000 });
});
```

## Network Configuration

### Testnet (default)
```typescript
await installMockStellarWallet({
  page,
  secretKey: SECRET_KEY,
  // network defaults to "TESTNET"
});
```

### Mainnet
```typescript
import { Networks } from "@stellar/stellar-sdk";

await installMockStellarWallet({
  page,
  secretKey: SECRET_KEY,
  network: "PUBLIC",
  networkPassphrase: Networks.PUBLIC,
});
```

### Local Standalone
```typescript
await installMockStellarWallet({
  page,
  secretKey: SECRET_KEY,
  network: "STANDALONE",
  networkPassphrase: "Standalone Network ; February 2017",
});
```

## Recommended Playwright Config

```typescript
// playwright.config.ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: { timeout: 45_000 },
  use: { headless: true },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
```

Use `timeout: 60_000` for test timeout and `expect.timeout: 45_000` for assertion timeout — Soroban transactions on testnet can take up to 45 seconds.
