# API Routes Reference

All routes are mounted under `/api` via `src/api/routes/index.ts`. Routes are grouped by domain and use either session auth (frontend) or API key auth (agents).

## Authentication

**File:** `src/api/routes/auth.routes.ts`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/session` | None (Stytch token in body) | Validate Stytch session, find/create user, return session |

## User Management

**File:** `src/api/routes/user.routes.ts`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/user/profile` | Session | Get current user profile |
| PUT | `/api/user/telegram` | Session | Set Telegram username (resets chat ID) |
| GET | `/api/user/secrets` | Session | List user's claimed secrets |
| POST | `/api/user/telegram/link` | Session | Generate 10-minute Telegram linking code |

## Secret Management

**File:** `src/api/routes/secrets.routes.ts`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/secrets` | None | Create secret (agent endpoint). Returns API key + claim URL |
| POST | `/api/secrets/relink` | None (relink token) | Exchange relink token for new API key |
| GET | `/api/secrets/info` | API Key | Get secret metadata for the authenticated secret |
| GET | `/api/secrets/:id` | Session + Owner | Get secret details |
| POST | `/api/secrets/:id/claim` | Session | Claim a secret with claim token |
| DELETE | `/api/secrets/:id` | Session + Owner | Soft delete a secret |
| POST | `/api/secrets/:id/relink-token` | Session + Owner | Generate relink token |
| GET | `/api/secrets/:id/balances` | Session + Owner | Get wallet balances (Alchemy) |

## API Key Management

**File:** `src/api/routes/apiKeys.routes.ts`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/secrets/:secretId/api-keys` | Session + Owner | Create new API key |
| GET | `/api/secrets/:secretId/api-keys` | Session + Owner | List API keys |
| DELETE | `/api/secrets/:secretId/api-keys/:keyId` | Session + Owner | Revoke API key |

## Policy Management

**File:** `src/api/routes/policies.routes.ts`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/secrets/:secretId/policies` | Session + Owner | List policies |
| POST | `/api/secrets/:secretId/policies` | Session + Owner | Create policy (409 if type exists) |
| PUT | `/api/secrets/:secretId/policies/:policyId` | Session + Owner | Update policy config |
| DELETE | `/api/secrets/:secretId/policies/:policyId` | Session + Owner | Delete policy |

## EVM Wallet Skill

**File:** `src/api/routes/evmWallet.routes.ts`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/skills/evm-wallet/transfer` | API Key | Transfer ETH or ERC20 |
| POST | `/api/skills/evm-wallet/send-transaction` | API Key | Execute arbitrary contract call |
| GET | `/api/skills/evm-wallet/balance` | API Key | Get ETH + ERC20 balances |
| GET | `/api/skills/evm-wallet/address` | API Key | Get smart account address |
| GET | `/api/skills/evm-wallet/balances` | API Key | Portfolio balances (Alchemy, multi-chain) |
| POST | `/api/skills/evm-wallet/swap/preview` | API Key | Preview token swap (0x) |
| POST | `/api/skills/evm-wallet/swap/execute` | API Key | Execute token swap (0x) |

## Polymarket Skill

**File:** `src/api/routes/polymarket.routes.ts`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/skills/polymarket/bet` | API Key | Place limit or market order |
| GET | `/api/skills/polymarket/positions` | API Key | Get open orders |
| GET | `/api/skills/polymarket/trades` | API Key | Get trade history |
| GET | `/api/skills/polymarket/markets` | API Key | Browse markets (paginated) |
| GET | `/api/skills/polymarket/market/:conditionId` | API Key | Get specific market info |
| GET | `/api/skills/polymarket/orderbook/:tokenId` | API Key | Get order book |
| GET | `/api/skills/polymarket/balance` | API Key | Get USDC collateral balance |
| DELETE | `/api/skills/polymarket/orders/:orderId` | API Key | Cancel specific order |
| DELETE | `/api/skills/polymarket/orders` | API Key | Cancel all orders |

## Trade Manager (Polymarket Rules)

**File:** `src/api/routes/tradeRules.routes.ts` (mounted under polymarket routes)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/skills/polymarket/rules` | API Key | Create a trade rule (stop-loss, take-profit, trailing stop) |
| GET | `/api/skills/polymarket/rules` | API Key | List rules (`?status=ACTIVE`) |
| GET | `/api/skills/polymarket/rules/:id` | API Key | Get rule details |
| PATCH | `/api/skills/polymarket/rules/:id` | API Key | Update trigger price |
| DELETE | `/api/skills/polymarket/rules/:id` | API Key | Cancel a rule |
| GET | `/api/skills/polymarket/rules/events` | API Key | Event log (`?ruleId=...&limit=100&offset=0`) |
| GET | `/api/skills/polymarket/rules/positions` | API Key | Monitored positions for this agent |
| GET | `/api/skills/polymarket/rules/status` | API Key | Worker status (running, circuit breaker, WebSocket) |

## Raw Signer

**File:** `src/api/routes/rawSigner.routes.ts`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/skills/raw-signer/sign-message` | API Key | Sign a message (Ethereum or Solana) |
| POST | `/api/skills/raw-signer/sign-transaction` | API Key | Sign a transaction |
| GET | `/api/skills/raw-signer/address` | API Key | Get signer addresses |

## Audit Logs

**File:** `src/api/routes/auditLogs.routes.ts`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/secrets/:secretId/audit-logs` | Session + Owner | List logs (filterable, paginated) |
| GET | `/api/secrets/:secretId/audit-logs/actions` | Session + Owner | Distinct action types (for filters) |
| GET | `/api/secrets/:secretId/audit-logs/export` | Session + Owner | Export as JSON or CSV |
| GET | `/api/secrets/:secretId/audit-logs/:logId` | Session + Owner | Single log detail |

## Ownership Transfer

**File:** `src/api/routes/ownership.routes.ts`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/secrets/:secretId/take-ownership/challenge` | Session + Owner | Request challenge message |
| POST | `/api/secrets/:secretId/take-ownership/verify` | Session + Owner | Submit signature, execute transfer |
| GET | `/api/secrets/:secretId/take-ownership/status` | Session + Owner | Get ownership status |

## Billing

**File:** `src/api/routes/billing.routes.ts`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/billing/subscription` | Session | Get subscription status |
| POST | `/api/billing/subscribe` | Session | Create Stripe Checkout session |
| POST | `/api/billing/cancel` | Session | Cancel subscription at period end |
| POST | `/api/billing/webhook` | Stripe signature | Stripe webhook handler |
| GET | `/api/billing/usage` | Session | Current month gas usage |
| GET | `/api/billing/usage/history` | Session | Monthly usage history |
| GET | `/api/billing/invoices` | Session | Past invoices |

## OpenClaw Deployment

**File:** `src/api/routes/openclaw.routes.ts`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/openclaw/deploy` | Session | Start deployment (creates Stripe Checkout) |
| GET | `/api/openclaw/deployments` | Session | List user's deployments |
| GET | `/api/openclaw/deployments/:id` | Session | Get deployment status |
| POST | `/api/openclaw/deployments/:id/cancel` | Session | Cancel subscription at period end |
| DELETE | `/api/openclaw/deployments/:id` | Session | Destroy deployment immediately |
| POST | `/api/openclaw/deployments/:id/restart` | Session | Restart OpenClaw on VPS |
| GET | `/api/openclaw/deployments/:id/usage` | Session | Get LLM usage stats |
| POST | `/api/openclaw/deployments/:id/credits` | Session | Add LLM credits ($5-$500) |

## Data Source Management

**File:** `src/api/routes/dataSourceManagement.routes.ts`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/secrets/:id/data-sources` | Session + Owner | Available data sources + usage stats |
| GET | `/api/secrets/:id/data-sources/credits` | Session + Owner | Credit balance + purchases |
| POST | `/api/secrets/:id/data-sources/credits` | Session + Owner | Add credits (Stripe charge) |
| GET | `/api/secrets/:id/data-sources/usage` | Session + Owner | Usage breakdown |

## Data Source Proxy (Agent Endpoints)

**File:** `src/dataSources/router.ts` + `src/dataSources/twitter/routes.ts` + `src/dataSources/brave/routes.ts`

All proxy endpoints use API key auth + data source guard middleware (type check, claim check, credit gate).

### Twitter (`/api/data-sources/twitter/`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/data-sources/twitter/search` | API Key | Search recent tweets |
| GET | `/api/data-sources/twitter/tweets/:tweetId` | API Key | Get tweet by ID |
| GET | `/api/data-sources/twitter/users/:username` | API Key | Get user profile |
| GET | `/api/data-sources/twitter/users/:userId/tweets` | API Key | Get user's tweets |

### Brave Search (`/api/data-sources/brave/`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/data-sources/brave/web` | API Key | Web search |
| GET | `/api/data-sources/brave/news` | API Key | News search |

## Admin

**File:** `src/api/routes/admin.routes.ts`

Admin endpoints for internal management. Session auth with admin role check.
