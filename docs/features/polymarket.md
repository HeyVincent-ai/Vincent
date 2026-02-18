# Polymarket Skill

The Polymarket skill lets agents trade on Polymarket prediction markets. It reuses the `EVM_WALLET` secret type — the same EOA private key is used for both EVM transactions and Polymarket CLOB operations.

## Key Design Decision

Polymarket requires direct EOA signing (EIP-712 for CLOB orders), not smart account transactions. The **EOA address** (not the ZeroDev smart account address) is the Polymarket wallet. This means the EOA must be funded with USDC on Polygon (chain 137) for Polymarket operations.

## How It Works

### Credential Management

CLOB API credentials (apiKey, secret, passphrase) are derived lazily on first Polymarket operation:

1. First time an agent calls a Polymarket endpoint
2. Backend derives CLOB API credentials via L1 auth (EIP-712 signing with the EOA)
3. Credentials stored in `PolymarketCredentials` model
4. Subsequent calls reuse stored credentials

### Capabilities

| Endpoint | Method | Description |
|---|---|---|
| `/api/skills/polymarket/bet` | POST | Place limit (GTC) or market (FOK) order |
| `/api/skills/polymarket/positions` | GET | Get open orders (optional market filter) |
| `/api/skills/polymarket/trades` | GET | Trade history |
| `/api/skills/polymarket/markets` | GET | Browse markets (paginated) |
| `/api/skills/polymarket/market/:conditionId` | GET | Specific market info |
| `/api/skills/polymarket/orderbook/:tokenId` | GET | Order book |
| `/api/skills/polymarket/balance` | GET | USDC collateral balance |
| `/api/skills/polymarket/orders/:orderId` | DELETE | Cancel specific order |
| `/api/skills/polymarket/orders` | DELETE | Cancel all orders |

### Policy Integration

Polymarket bets reuse existing spending limit policies by treating the bet amount as a `transfer`-type action:

- **BUY orders:** `amount` is USD to spend
- **SELL orders:** `amount` is shares to sell (USD value approximated using price for policy checks)
- Spending limits (per-tx, daily, weekly) apply to the USD value
- `REQUIRE_APPROVAL` and `APPROVAL_THRESHOLD` send bets to Telegram for approval
- Market allowlist policy type was deferred (would need a new `PolicyType` enum value)

### Bet Placement Flow

```
Agent calls POST /api/skills/polymarket/bet
  → Validate request (Zod)
  → Load wallet data + CLOB credentials (lazy derive if first time)
  → Calculate USD value for policy check
  → Check policies (deny/allow/require_approval)
  → If allowed: place order via CLOB API
  → Create TransactionLog with actionType 'bet'
  → If requires approval: create PendingApproval, send to Telegram
  → Return result
```

## Architecture

Two service layers:

1. **`polymarket.service.ts`** — Low-level CLOB client wrapper
   - Direct `@polymarket/clob-client` calls
   - Credential management (get-or-create pattern)
   - Market info, order book, midpoint queries (unauthenticated)
   - Order placement, cancellation, position/trade queries (authenticated)

2. **`polymarketSkill.service.ts`** — High-level skill with policy integration
   - `placeBet()` with full policy check flow
   - `getPositions()`, `getBalance()`, `getTrades()`
   - `getMarketInfo()`, `searchMarkets()`, `getOrderBook()`
   - `cancelOrder()`, `cancelAllOrders()`
   - TransactionLog recording, Telegram approval integration

## Dependencies

- `@polymarket/clob-client` v5.2.1 — CLOB API client
- Uses `@ethersproject/wallet` (ethers.js v5) for EIP-712 signing (transitive dependency)

## Files

| File | Responsibility |
|---|---|
| `src/skills/polymarket.service.ts` | Low-level CLOB API wrapper |
| `src/skills/polymarketSkill.service.ts` | High-level skill with policies |
| `src/api/routes/polymarket.routes.ts` | REST endpoints |
| `skills/polymarket/SKILL.md` | Agent-facing skill documentation |
