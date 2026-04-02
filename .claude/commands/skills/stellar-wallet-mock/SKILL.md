---
description: Stellar wallet mock for Playwright tests. Trigger when writing Playwright tests for Stellar/Soroban dApps, mocking Freighter wallet, using installMockStellarWallet, or generating test code that interacts with wallet signing.
---

# Skill: stellar-wallet-mock

Mock the Freighter wallet browser extension in Playwright tests for Stellar/Soroban dApps. Enables headless E2E testing without a real wallet extension.

## Installation

```bash
npm install github:SentinelFi/stellar_wallet_mock
npm install -D @playwright/test
npx playwright install chromium
```

## Core API

### `installMockStellarWallet(options)` — main entry point

**Must be called BEFORE `page.goto()`.** Installs the mock into a Playwright page.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `page` | `Page` | Yes | — | Playwright Page instance |
| `secretKey` | `string` | Yes | — | Stellar secret key (starts with `S`) |
| `network` | `string` | No | `"TESTNET"` | Network name |
| `networkPassphrase` | `string` | No | `Networks.TESTNET` | Stellar network passphrase |

Returns `Promise<MockWallet>` with properties: `keypair`, `publicKey`, `network`, `networkPassphrase`, `getInjectionConfig()`.

### `createWallet(secretKey, options?)` — standalone wallet creation

Creates a wallet instance without installing into a page. Useful for getting the public key before page setup.

## Exported Types

```typescript
import type {
  MockWallet,              // Wallet instance
  WalletOptions,           // Network config options
  WalletInjectionConfig,   // Serialized config for browser
  InstallMockWalletOptions // Options for installMockStellarWallet()
} from "stellar-wallet-mock";
```

## Critical Rules

1. **Always call `installMockStellarWallet()` BEFORE `page.goto()`** — the mock must intercept messages from page load
2. **Never expose secret keys in test code** — use `process.env.WALLET_SECRET_KEY` or fixtures
3. **Use `{ timeout: 45_000 }` for assertions after Soroban transactions** — testnet transactions take 5-45s
4. **Chromium only** — Firefox and WebKit are not supported
5. **Single secret key per page** — for multi-account tests, use separate page instances

## Recommended Playwright Fixture Pattern

```typescript
// tests/fixtures.ts
import { test as base } from "@playwright/test";
import { installMockStellarWallet, type MockWallet } from "stellar-wallet-mock";

export const test = base.extend<{ wallet: MockWallet }>({
  wallet: async ({ page }, use) => {
    const wallet = await installMockStellarWallet({
      page,
      secretKey: process.env.WALLET_SECRET_KEY!,
      network: "TESTNET",
    });
    await use(wallet);
  },
});
export { expect } from "@playwright/test";
```

Then import `test` and `expect` from this fixture file, not from `@playwright/test` directly.

## How It Works (for understanding, not for code generation)

The mock uses a two-phase Playwright pattern:
1. `page.exposeFunction()` — bridges 3 Node.js signing functions into the browser (`__stellarMockSignTransaction`, `__stellarMockSignAuthEntry`, `__stellarMockSignMessage`)
2. `page.addInitScript()` — injects a script that sets `window.freighter = true`, pre-seeds `localStorage`, and intercepts `window.postMessage` events matching Freighter's protocol

Private keys never enter the browser. All cryptography runs in Node.js via `@stellar/stellar-sdk`.

## Compatibility

Works transparently with:
- `@stellar/freighter-api` directly
- `@creit-tech/stellar-wallets-kit` with FreighterModule
- Scaffold Stellar apps
- Any code using the Freighter `postMessage` protocol

## Progressive Disclosure — Reference Files

| When you need… | Read |
|---|---|
| Full examples (connect, sign tx, vault deposit/withdraw, read-only) | `references/examples.md` |
| Architecture details, message protocol, localStorage keys, signing internals | `references/internals.md` |
