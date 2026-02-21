# Self-Custody: Wallet Ownership Transfer

This feature allows users to take ownership of their ZeroDev smart wallet while ensuring Vincent's backend can still sign transactions on their behalf.

## The Problem

Initially, the backend EOA owns the smart account. Users may want true self-custody — their own wallet as the owner — while still allowing Vincent to execute policy-gated actions.

## How It Works

### At Wallet Creation

The backend EOA is set up in three roles:

1. **Sudo validator** (ECDSA) — initial owner, full control
2. **Guardian validator** (weighted ECDSA) — can execute recovery to change the owner
3. **Permission validator** (session key via `initConfig`) — can sign transactions after transfer

The permission validator is installed on-chain via `initConfig` and persists independently of the sudo validator change. The `sessionKeyData` (serialized permission account) is stored in `WalletSecretMetadata`.

### Transfer Flow

```
User connects wallet (RainbowKit)
  → Frontend requests challenge from backend
  → Backend generates signed message with secretId, wallet address, user address, timestamp, nonce
  → User signs the challenge with their personal wallet
  → Frontend submits signature to backend
  → Backend verifies signature
  → For each chain in chainsUsed:
      → Execute doRecovery() via guardian validator
      → Changes sudo validator from backend EOA to user's address
  → Update DB: ownershipTransferred=true, ownerAddress=user's address
```

### After Transfer

- User's EOA is the new sudo validator (owner)
- Backend signs transactions via `getSessionKeyKernelClient()`:
  1. Reads stored `sessionKeyData` from DB
  2. Calls `deserializePermissionAccount()` with backend EOA signer
  3. Reconstructs permission account for signing
- All existing policies still enforced
- User can also make transactions directly with their own wallet

## Frontend Integration

The `TakeOwnership` component uses RainbowKit + wagmi for wallet connection:

- ConnectButton for wallet connection
- `useSignMessage` for challenge signing
- Progress states: loading → connect → ready → signing → processing → success
- Shows transfer transaction hashes per chain on completion

**Prerequisite:** Wallet must have been used on at least one chain (so there's a deployed account to transfer).

## Challenge Security

- In-memory storage with 10-minute expiry (same pattern as Telegram linking codes)
- Challenge includes: secretId, wallet address, user address, timestamp, nonce
- One-time use: consumed immediately on successful verification
- Signature verified via viem's `verifyMessage()`

## API Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/api/secrets/:secretId/take-ownership/challenge` | Request challenge message |
| POST | `/api/secrets/:secretId/take-ownership/verify` | Submit signature, execute transfer |
| GET | `/api/secrets/:secretId/take-ownership/status` | Get ownership status |

All require session auth + secret ownership.

## ZeroDev Details

- Guardian validator: `@zerodev/weighted-ecdsa-validator` with weight 100, threshold 100 (single signer)
- Recovery function: `doRecovery(validatorAddress, newOwnerAddress)` — changes the sudo validator
- Permission validator: `@zerodev/permissions` with `toSudoPolicy()` (full permissions)
- Serialization: `serializePermissionAccount()` at creation, `deserializePermissionAccount()` at use

## Files

| File | Responsibility |
|---|---|
| `src/services/ownership.service.ts` | Challenge generation, signature verification, transfer orchestration |
| `src/api/routes/ownership.routes.ts` | REST endpoints |
| `src/skills/zerodev.service.ts` | `createSmartAccountWithRecovery()`, `executeRecovery()`, `getSessionKeyKernelClient()` |
| `src/skills/evmWallet.service.ts` | `getSessionKeyForSigning()` — routes to session key mode after transfer |
| `frontend/src/components/TakeOwnership.tsx` | UI component |
| `frontend/src/wagmi.ts` | Wagmi/RainbowKit configuration |
