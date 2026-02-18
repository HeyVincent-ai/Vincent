# EVM Wallet Skill

The EVM Wallet is the primary skill — it lets agents create and use Ethereum smart wallets. Under the hood, it uses ZeroDev SDK v5 for account abstraction (Kernel v3.1, EntryPoint v0.7).

## How It Works

When a wallet is created (`POST /api/secrets` with `type: EVM_WALLET`):

1. Backend generates an EOA private key
2. Creates a ZeroDev smart account owned by that EOA, with:
   - **Sudo validator** (ECDSA) — backend EOA as owner
   - **Guardian validator** (weighted ECDSA) — for ownership transfer recovery
   - **Permission validator** (session key via `initConfig`) — for post-transfer backend signing
3. Private key stored in PostgreSQL, never exposed to agents
4. Smart account address + API key + claim URL returned to agent
5. `sessionKeyData` (serialized permission account) stored in `WalletSecretMetadata`

Default derivation chain: Base Sepolia (84532). Multi-chain support via `CHAIN_MAP` in `zerodev.service.ts`.

## Capabilities

### Transfer

Send ETH or ERC20 tokens from the smart account.

**Endpoint:** `POST /api/skills/evm-wallet/transfer`

**Parameters:** `to`, `amount` (human-readable, e.g. "0.1"), `token` ("ETH" or ERC20 address), `chainId`

**Policies checked:** address_allowlist, token_allowlist, spending_limit_per_tx, spending_limit_daily, spending_limit_weekly, require_approval, approval_threshold

### Send Transaction

Execute arbitrary contract calls.

**Endpoint:** `POST /api/skills/evm-wallet/send-transaction`

**Parameters:** `to`, `data` (calldata), `value`, `chainId`

**Policies checked:** address_allowlist, function_allowlist, spending_limit_per_tx, spending_limit_daily, spending_limit_weekly, require_approval, approval_threshold

### Swap (0x Integration)

Token swaps via 0x Swap API v2.

**Preview:** `POST /api/skills/evm-wallet/swap/preview` — price quote without execution
**Execute:** `POST /api/skills/evm-wallet/swap/execute` — full swap

**Parameters:** `sellToken`, `buyToken`, `sellAmount` (human-readable), `chainId`, `slippageBps?`

**How execution works:**
1. Get quote from 0x API
2. Check policies (spending limits on sell amount, token allowlist on sell token)
3. For native ETH swaps: single `sendTransaction`
4. For ERC20 swaps: batched UserOp (approve + swap via `executeBatchTransaction`)
5. Log transaction, record gas

Supported chains: Ethereum, Sepolia, Polygon, Arbitrum, Optimism, Base, Avalanche, BNB Chain, Linea, Scroll, Blast.

### Balance

**ETH + ERC20:** `GET /api/skills/evm-wallet/balance` (supports `?tokens=addr1,addr2`)
**Portfolio (multi-chain):** `GET /api/skills/evm-wallet/balances` (Alchemy Portfolio API, 10 networks)

### Address

`GET /api/skills/evm-wallet/address` — returns the smart account address

## Gas Sponsorship

All transactions go through ZeroDev smart accounts with paymaster gas sponsorship:

- **Testnets:** Gas always sponsored (free)
- **Mainnets:** Requires active $10/month subscription

Gas costs tracked per-transaction in `GasUsage` table with USD conversion.

Subscription check happens in `gas.service.ts` before mainnet transaction execution.

## Chain Usage Tracking

Every successful transaction records the chain ID in `WalletSecretMetadata.chainsUsed[]`. This is used for:
- Multi-chain ownership transfer (recovery must run on every chain the wallet was used on)
- Knowing which chains have deployed smart account instances

## Post-Ownership-Transfer Signing

After a user takes ownership (see [Self-Custody](./self-custody.md)):
- `WalletSecretMetadata.ownershipTransferred` is `true`
- Backend uses `getSessionKeyKernelClient()` instead of regular `getKernelClient()`
- Deserializes stored `sessionKeyData` into a permission account
- Permission validator was installed on-chain via `initConfig` at wallet creation

## Files

| File | Responsibility |
|---|---|
| `src/skills/evmWallet.service.ts` | High-level: transfer, sendTx, swap, balance, policy integration |
| `src/skills/zerodev.service.ts` | ZeroDev SDK: account creation, tx execution, recovery, session keys |
| `src/skills/zeroEx.service.ts` | 0x Swap API v2 client |
| `src/skills/alchemy.service.ts` | Alchemy Portfolio API (multi-chain balances) |
| `src/skills/gas.service.ts` | Gas tracking, subscription checks |
| `src/api/routes/evmWallet.routes.ts` | REST endpoints with Zod validation |
| `skills/wallet/SKILL.md` | Agent-facing skill documentation |
