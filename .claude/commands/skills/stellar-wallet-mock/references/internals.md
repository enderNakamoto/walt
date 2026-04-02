# stellar-wallet-mock — Internals

Deep reference for the mock's architecture, message protocol, localStorage pre-seeding, and signing details. Read this when debugging test failures or understanding why the mock behaves a certain way.

## Architecture

```
Playwright Test (Node.js)
    |
    v
installMockStellarWallet(page, secretKey)
    |
    |-- createWallet(secretKey)          -- creates Keypair in Node.js
    |
    |-- page.exposeFunction() x3         -- bridges Node.js signing into browser
    |     * __stellarMockSignTransaction
    |     * __stellarMockSignAuthEntry
    |     * __stellarMockSignMessage
    |
    +-- page.addInitScript()             -- injects mock before dApp loads
          * sets window.freighter = true
          * pre-seeds localStorage
          * listens for postMessage events (Freighter protocol)
          * routes signing requests to exposed Node.js functions
```

The mock operates at the `window.postMessage` layer — the universal protocol all Freighter integrations use.

## Message Protocol

Freighter uses `postMessage` with specific source strings. The mock intercepts requests and responds with matching IDs.

### Request format (dApp → mock)
```typescript
window.postMessage({
  source: "FREIGHTER_EXTERNAL_MSG_REQUEST",
  messageId: "<unique-id>",
  type: "REQUEST_PUBLIC_KEY",  // or SUBMIT_TRANSACTION, etc.
  transactionXdr: "...",       // only for SUBMIT_TRANSACTION
  entryXdr: "...",             // only for SUBMIT_AUTH_ENTRY
  blob: "...",                 // only for SUBMIT_BLOB
}, window.location.origin);
```

### Response format (mock → dApp)
```typescript
window.postMessage({
  source: "FREIGHTER_EXTERNAL_MSG_RESPONSE",
  messagedId: "<matching-id>",  // NOTE: "messagedId" is a typo in Freighter's actual protocol
  publicKey: "G...",
  signedTransaction: "...",
}, window.location.origin);
```

**Important:** The `messagedId` field is intentionally misspelled — this matches a typo in Freighter's real protocol. `freighter-api` matches responses using this misspelled field.

### Supported Message Types

| Message Type | Purpose | Response Fields |
|---|---|---|
| `REQUEST_CONNECTION_STATUS` | Check if wallet connected | `isConnected: true` |
| `REQUEST_ACCESS` | Request wallet access | `publicKey` |
| `REQUEST_PUBLIC_KEY` | Get connected address | `publicKey` |
| `REQUEST_NETWORK` | Get network name/passphrase | `network, networkPassphrase` |
| `REQUEST_NETWORK_DETAILS` | Get detailed network info | `network, networkPassphrase, sorobanRpcUrl` |
| `SUBMIT_TRANSACTION` | Sign a transaction XDR | `signedTransaction, signerAddress` |
| `SUBMIT_AUTH_ENTRY` | Sign a Soroban auth entry | `signedAuthEntry, signerAddress` |
| `SUBMIT_BLOB` | Sign an arbitrary message | `signedMessage, signerAddress` |
| `REQUEST_ALLOWED_STATUS` | Check domain allowlist | `isAllowed: true` |
| `SET_ALLOWED_STATUS` | Set domain allowlist | `isAllowed: true` |
| `REQUEST_USER_INFO` | Get user info | `publicKey` |

## localStorage Pre-Seeding

The mock pre-seeds localStorage so dApps boot directly into a connected state (no "Connect Wallet" modal).

### stellar-wallets-kit keys

| Key | Value | Why |
|---|---|---|
| `@StellarWalletsKit/activeAddress` | Public key | Kit reads this to restore active account |
| `@StellarWalletsKit/selectedModuleId` | `"freighter"` | Tells kit which wallet module to use |
| `@StellarWalletsKit/usedWalletsIds` | `["freighter"]` | Marks Freighter as previously used |

### Scaffold Stellar keys

| Key | Value | Why |
|---|---|---|
| `walletId` | `"freighter"` | Identifies the connected wallet type |
| `walletAddress` | Public key | Restores connected account address |
| `walletNetwork` | Network name | Restores selected network |
| `networkPassphrase` | Network passphrase | Required for signing context |

If the dApp doesn't use either library, the extra localStorage keys are harmless.

## Signing Details

Three exposed functions, each for a different signing type:

### Transaction signing (`SUBMIT_TRANSACTION`)
```typescript
// __stellarMockSignTransaction
async (transactionXdr: string): Promise<string> => {
  const kp = Keypair.fromSecret(secretKey);
  const tx = TransactionBuilder.fromXDR(transactionXdr, networkPassphrase);
  tx.sign(kp);       // ed25519 signature over network hash + tx envelope
  return tx.toXDR(); // signed XDR back to browser
}
```

### Soroban auth entry signing (`SUBMIT_AUTH_ENTRY`)
```typescript
// __stellarMockSignAuthEntry
async (entryXdr: string): Promise<string> => {
  const kp = Keypair.fromSecret(secretKey);
  const preimageBytes = Buffer.from(entryXdr, "base64");
  const hash = crypto.createHash("sha256").update(preimageBytes).digest();
  const signature = kp.sign(hash); // ed25519 sign the SHA-256 hash
  return signature.toString("base64");
}
```

This is the same two-step process the real Freighter uses: SHA-256 hash the `HashIdPreimage` XDR, then ed25519 sign the hash. Required for any Soroban contract call that uses `require_auth()`.

### Arbitrary message signing (`SUBMIT_BLOB`)
```typescript
// __stellarMockSignMessage
async (message: string): Promise<string> => {
  const kp = Keypair.fromSecret(secretKey);
  const messageBuf = Buffer.from(message, "utf-8");
  const signature = kp.sign(messageBuf); // ed25519 sign raw bytes
  return signature.toString("base64");
}
```

## Limitations

- **Wallet support:** Only Freighter — xBull, Albedo, Lobstr are not mocked
- **Browser:** Chromium-based browsers only
- **Accounts:** Single secret key per page instance
- **Package source:** Installed from GitHub, not npm (`github:SentinelFi/stellar_wallet_mock`)
