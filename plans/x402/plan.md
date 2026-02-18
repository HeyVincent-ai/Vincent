# x402 Skill - Product Plan

## Overview

x402 is an open payment protocol (created by Coinbase, co-governed with Cloudflare) that uses the HTTP 402 status code to enable machine-to-machine micropayments over standard HTTP. An agent hits a paid API, gets a 402 response with payment requirements, signs a USDC transfer authorization, retries with the signature, and gets the data — all in one round-trip. No accounts, no API keys, no KYC. Just a wallet with USDC.

The x402 ecosystem includes a growing catalog of paid API services — CoinGecko (crypto data), Exa (AI search), OpenRouter (LLM gateway), Reducto (document parsing), Apollo (sales prospecting), Nyne (person search), Dome (prediction markets), and many more. These services are discoverable via the **Bazaar**, a public discovery API.

This plan adds x402 as a **new first-class Vincent skill** that reuses the existing EVM wallet infrastructure. The agent calls `POST /api/skills/x402/fetch` with a URL, and Vincent handles the entire 402 payment flow server-side — policy check, signing, payment, and response forwarding. The agent never deals with the payment protocol directly.

## Problem Statement

Today, an agent using Vincent can transfer tokens and swap on DEXs, but it **cannot consume paid APIs** without the user manually provisioning API keys for each service. This is the same problem Data Sources solved for Twitter and Brave — but x402 solves it at protocol level for a much larger catalog of services, and the agent pays per-call with USDC from its own wallet rather than drawing from a shared credit balance.

The alternative — having the agent use the Raw Signer to manually construct x402 payment messages — is fragile, error-prone, and invisible to the policy engine (policies would only see "sign this hex blob," not "pay $0.001 to CoinGecko for crypto price data").

## Architecture

```
┌──────────────────┐     ┌──────────────────────────┐     ┌────────────────┐
│  Agent           │────▶│  Vincent Backend          │────▶│  x402 Service  │
│  (OpenClaw or    │     │  (x402 Skill)             │     │  (CoinGecko,   │
│   BYOA)          │     │                           │     │   Exa, etc.)   │
│                  │     │  - API key auth (ssk_)    │     └───────┬────────┘
│  Calls           │     │  - Policy check           │             │
│  POST /x402/fetch│     │  - @x402/fetch with       │     ┌───────┴────────┐
│  with target URL │     │    wallet private key      │     │  Facilitator   │
└──────────────────┘     │  - Transaction logging     │     │  (CDP / Stripe)│
                         │  - USDC cost tracking      │     │  → Base chain  │
                         └──────────────────────────┘     └────────────────┘
```

### How It Works (Request Flow)

1. Agent calls `POST /api/skills/x402/fetch` with `{ url, method?, body?, headers? }` and its `ssk_` Bearer token
2. Vincent resolves the API key → finds the `EVM_WALLET` secret (same wallet used for transfers/swaps)
3. Vincent builds a `PolicyCheckAction` and runs it through `checkPolicies()`:
   - Is the target URL/domain in the x402 service allowlist?
   - Is the estimated cost within the per-call max?
   - Is cumulative daily x402 spend within the daily budget?
4. If policy denies → return `{ status: "denied", reason }` (403)
5. If policy requires approval → create `PendingApproval`, notify via Telegram, return `{ status: "pending_approval" }` (202)
6. If policy allows → execute the x402 fetch:
   a. `@x402/fetch` makes the initial HTTP request to the target URL
   b. Service returns HTTP 402 with `PAYMENT-REQUIRED` header (amount, payTo, network, asset)
   c. Library constructs USDC transfer authorization and signs with the wallet's private key
   d. Library retries the request with `PAYMENT-SIGNATURE` header
   e. Service verifies payment, settles on-chain via facilitator, returns data (HTTP 200)
7. Vincent logs the transaction (cost, service, response status) in `TransactionLog`
8. Vincent returns the service's response data to the agent

### Why Reuse EVM_WALLET (Not a New Secret Type)

The x402 skill **operates on existing `EVM_WALLET` secrets**. It does not need its own secret type because:

- The wallet already has a private key capable of signing USDC transfers
- The wallet already has USDC balance management (fund via transfer)
- Policies already apply per-secret — x402 policies attach to the same wallet
- The agent already has an `ssk_` key scoped to the wallet
- In the dashboard, x402 spending shows up alongside transfers and swaps in the same wallet's activity log

The only thing we need to determine is **which wallet to use** when the agent calls the x402 skill. Since the `ssk_` API key is scoped to a specific secret, and x402 requires an `EVM_WALLET` secret, the middleware resolves this naturally: the API key must belong to an `EVM_WALLET` secret.

## API Endpoints

### `POST /api/skills/x402/fetch`

The core endpoint. Calls a paid x402 service and handles payment automatically.

**Auth:** `Authorization: Bearer ssk_xxx` (must be scoped to an `EVM_WALLET` secret)

**Request:**
```json
{
  "url": "https://x402.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
  "method": "GET",
  "headers": {},
  "body": null
}
```

**Response (executed):** `200`
```json
{
  "success": true,
  "data": {
    "status": "executed",
    "cost": "0.001",
    "costCurrency": "USDC",
    "network": "base",
    "serviceResponse": {
      "ethereum": { "usd": 3200.50 }
    },
    "transactionLogId": "clxyz..."
  }
}
```

**Response (denied):** `403`
```json
{
  "success": true,
  "data": {
    "status": "denied",
    "reason": "URL not in x402 service allowlist",
    "transactionLogId": "clxyz..."
  }
}
```

**Response (pending_approval):** `202`
```json
{
  "success": true,
  "data": {
    "status": "pending_approval",
    "reason": "x402 call exceeds $0.05, requires owner approval",
    "transactionLogId": "clxyz..."
  }
}
```

### `GET /api/skills/x402/discover`

Browse available x402 services from the Bazaar discovery API.

**Auth:** `Authorization: Bearer ssk_xxx`

**Query params:**
- `limit` (number, default 50) — max results
- `category` (string, optional) — filter by category (e.g. "data", "search", "llm")
- `maxPrice` (string, optional) — max price per call in USD (e.g. "0.01")

**Response:** `200`
```json
{
  "success": true,
  "data": {
    "services": [
      {
        "name": "CoinGecko",
        "category": "data",
        "description": "On-demand crypto price and market data",
        "resource": "https://x402.coingecko.com/api/v3/simple/price",
        "price": "0.001",
        "priceCurrency": "USDC",
        "network": "base"
      }
    ],
    "total": 142
  }
}
```

### `GET /api/skills/x402/balance`

Check the wallet's USDC balance on the x402 payment network (Base) and x402 spending summary.

**Auth:** `Authorization: Bearer ssk_xxx`

**Response:** `200`
```json
{
  "success": true,
  "data": {
    "usdcBalance": "12.45",
    "network": "base",
    "smartAccountAddress": "0x...",
    "spending": {
      "today": "0.34",
      "thisWeek": "2.10",
      "allTime": "15.80"
    },
    "callCount": {
      "today": 340,
      "thisWeek": 2100,
      "allTime": 15800
    }
  }
}
```

### `GET /api/skills/x402/history`

Get past x402 purchases for this wallet.

**Auth:** `Authorization: Bearer ssk_xxx`

**Query params:**
- `limit` (number, default 20)
- `offset` (number, default 0)

**Response:** `200`
```json
{
  "success": true,
  "data": {
    "transactions": [
      {
        "id": "clxyz...",
        "url": "https://x402.coingecko.com/api/v3/simple/price?ids=ethereum",
        "service": "coingecko.com",
        "cost": "0.001",
        "status": "EXECUTED",
        "createdAt": "2026-02-18T12:30:00Z"
      }
    ],
    "total": 340
  }
}
```

## Policy Integration

x402 integrates with the existing policy engine. We add **two new policy types** to the `PolicyType` enum:

### `X402_SERVICE_ALLOWLIST`

Controls which x402 services the agent can call, by domain or full URL prefix.

```json
{
  "policyType": "X402_SERVICE_ALLOWLIST",
  "policyConfig": {
    "domains": [
      "x402.coingecko.com",
      "exa.ai",
      "api.openrouter.ai"
    ],
    "approvalOverride": false
  }
}
```

When present, only URLs matching an allowed domain are permitted. Requests to unlisted domains are denied (or routed to approval if `approvalOverride` is true).

### `X402_SPENDING_LIMIT`

Controls x402-specific spending. Uses the same spending window model as existing spending limit policies, but scoped to x402 transactions only.

```json
{
  "policyType": "X402_SPENDING_LIMIT",
  "policyConfig": {
    "maxPerCallUsd": 0.10,
    "maxDailyUsd": 5.00,
    "maxWeeklyUsd": 25.00,
    "approvalOverride": true
  }
}
```

Each field is optional. When a limit is set:
- `maxPerCallUsd` — any single x402 call exceeding this is denied/sent to approval
- `maxDailyUsd` — rolling 24h x402 spend exceeding this blocks further calls
- `maxWeeklyUsd` — rolling 7d x402 spend exceeding this blocks further calls

### How Policies Map to `PolicyCheckAction`

We extend the `PolicyCheckAction` type with a new action type:

```typescript
interface PolicyCheckAction {
  type: 'transfer' | 'send_transaction' | 'x402_fetch';
  // ... existing fields ...
  x402Url?: string;        // Target x402 URL
  x402Domain?: string;     // Extracted domain
  x402EstimatedCost?: number; // Estimated USDC cost
}
```

The policy checker gains two new branches:
1. **`X402_SERVICE_ALLOWLIST`** — check `action.x402Domain` against `config.domains`
2. **`X402_SPENDING_LIMIT`** — check `action.x402EstimatedCost` against per-call max; sum recent x402 `TransactionLog` entries against daily/weekly limits

Existing policies (`ADDRESS_ALLOWLIST`, `SPENDING_LIMIT_DAILY`, etc.) are **ignored** for `x402_fetch` actions — they don't apply (there's no "to" address or token amount in the traditional sense).

## Database Changes

### Prisma Schema

Add to `PolicyType` enum:
```prisma
enum PolicyType {
  ADDRESS_ALLOWLIST
  FUNCTION_ALLOWLIST
  TOKEN_ALLOWLIST
  SPENDING_LIMIT_PER_TX
  SPENDING_LIMIT_DAILY
  SPENDING_LIMIT_WEEKLY
  REQUIRE_APPROVAL
  APPROVAL_THRESHOLD
  X402_SERVICE_ALLOWLIST    // NEW
  X402_SPENDING_LIMIT       // NEW
}
```

No new models needed. x402 transactions are logged in the existing `TransactionLog` model:
- `actionType`: `"x402_fetch"`
- `requestData`: `{ url, method, domain, estimatedCost }`
- `responseData`: `{ cost, network, serviceResponseStatus, paymentHash }`
- `status`: `EXECUTED` / `DENIED` / `PENDING` / `FAILED`

The `usdValue` field on `TransactionLog` captures the USDC cost of each x402 call, which enables spending limit queries using the existing pattern (sum `usdValue` where `actionType = 'x402_fetch'` within window).

## Implementation

### New Files

| File | Purpose |
|------|---------|
| `src/skills/x402.service.ts` | x402 skill service (fetch, discover, balance, history) |
| `src/api/routes/x402.routes.ts` | Express routes for x402 endpoints |
| `skills/x402/SKILL.md` | Agent-facing skill documentation |
| `src/e2e/x402.e2e.test.ts` | End-to-end tests |
| `skill-ci/src/tests/x402.test.ts` | Skill CI agent test |
| `prisma/migrations/xxx_add_x402_policy_types/migration.sql` | DB migration |

### Modified Files

| File | Change |
|------|--------|
| `src/api/routes/index.ts` | Add `router.use('/skills/x402', x402Router)` |
| `src/skills/index.ts` | Add `export * as x402 from './x402.service.js'` |
| `prisma/schema.prisma` | Add `X402_SERVICE_ALLOWLIST` and `X402_SPENDING_LIMIT` to `PolicyType` enum |
| `src/policies/checker.ts` | Add x402 policy evaluation branches |
| `src/services/policy.service.ts` | Add x402 policy config types and validation |
| `src/utils/env.ts` | Add optional `X402_DEFAULT_NETWORK` env var |
| `frontend/src/components/PolicyManager.tsx` | Add x402 policy configuration UI |
| `frontend/src/pages/SecretDetail.tsx` | Show x402 spending stats in wallet detail |

### Dependencies

```bash
npm install @x402/fetch @x402/evm @x402/core
```

These are the official x402 client libraries from Coinbase. `@x402/fetch` wraps `fetch()` with automatic 402 handling. `@x402/evm` provides EVM chain signing support. `@x402/core` has shared types.

### Skill Service (`src/skills/x402.service.ts`)

Core implementation pattern (follows the same structure as `evmWallet.service.ts`):

```typescript
import { x402Client, wrapFetchWithPayment } from '@x402/fetch';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import { privateKeyToAccount } from 'viem/accounts';
import prisma from '../db/client.js';
import { checkPolicies, type PolicyCheckAction } from '../policies/checker.js';
import { sendApprovalRequest } from '../telegram/index.js';

// Helper: get wallet data (same pattern as evmWallet.service.ts)
async function getWalletData(secretId: string) {
  const secret = await prisma.secret.findFirst({
    where: { id: secretId, deletedAt: null },
    include: { walletMetadata: true },
  });
  if (!secret || secret.type !== 'EVM_WALLET' || !secret.value) {
    throw new AppError('INVALID_SECRET', 'x402 requires an EVM_WALLET secret', 400);
  }
  return { privateKey: secret.value as Hex, smartAccountAddress: secret.walletMetadata!.smartAccountAddress };
}

// Helper: create x402 fetch client for a wallet
function createX402Fetch(privateKey: Hex) {
  const signer = privateKeyToAccount(privateKey);
  const client = new x402Client();
  registerExactEvmScheme(client, { signer });
  return wrapFetchWithPayment(fetch, client);
}

// Main action: fetch a paid x402 endpoint
export async function executeFetch(input: X402FetchInput): Promise<X402FetchOutput> {
  const wallet = await getWalletData(input.secretId);
  const domain = new URL(input.url).hostname;

  // 1. Policy check
  const policyAction: PolicyCheckAction = {
    type: 'x402_fetch',
    to: domain,
    x402Url: input.url,
    x402Domain: domain,
  };
  const policyResult = await checkPolicies(input.secretId, policyAction);

  // 2. Create transaction log
  const txLog = await prisma.transactionLog.create({
    data: {
      secretId: input.secretId,
      apiKeyId: input.apiKeyId,
      actionType: 'x402_fetch',
      requestData: { url: input.url, method: input.method, domain },
      status: policyResult.verdict === 'allow' ? 'PENDING' : 'DENIED',
    },
  });

  // 3. Handle deny / require_approval (same pattern as evmWallet)
  if (policyResult.verdict === 'deny') { /* ... return denied ... */ }
  if (policyResult.verdict === 'require_approval') { /* ... create PendingApproval, send Telegram ... */ }

  // 4. Execute x402 fetch
  const fetchWithPayment = createX402Fetch(wallet.privateKey);
  const response = await fetchWithPayment(input.url, {
    method: input.method || 'GET',
    headers: input.headers,
    body: input.body ? JSON.stringify(input.body) : undefined,
  });

  // 5. Extract cost from PAYMENT-RESPONSE header
  const cost = extractCostFromResponse(response);

  // 6. Update transaction log
  await prisma.transactionLog.update({
    where: { id: txLog.id },
    data: {
      status: 'EXECUTED',
      usdValue: cost,
      responseData: { cost, serviceStatus: response.status },
    },
  });

  return {
    status: 'executed',
    cost: cost.toString(),
    costCurrency: 'USDC',
    serviceResponse: await response.json(),
    transactionLogId: txLog.id,
  };
}
```

### Route File (`src/api/routes/x402.routes.ts`)

Standard Express router with Zod validation, following the same pattern as `evmWallet.routes.ts`:

```typescript
const router = Router();
router.use(apiKeyAuthMiddleware);

const fetchSchema = z.object({
  url: z.string().url(),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).default('GET'),
  headers: z.record(z.string()).optional(),
  body: z.any().optional(),
});

router.post('/fetch', asyncHandler(async (req, res) => {
  const body = fetchSchema.parse(req.body);
  if (!req.secret) { errors.unauthorized(res, 'No secret'); return; }
  const result = await x402Service.executeFetch({
    secretId: req.secret.id,
    apiKeyId: req.apiKey?.id,
    ...body,
  });
  const statusCode = result.status === 'executed' ? 200 : result.status === 'denied' ? 403 : 202;
  sendSuccess(res, result, statusCode);
}));
```

## Frontend Changes

### Policy Manager

Add x402 policy types to the `PolicyManager.tsx` component:

1. **x402 Service Allowlist** — multi-input field for allowed domains, same UX as address allowlist
2. **x402 Spending Limit** — three optional numeric fields: per-call max, daily max, weekly max

### Wallet Detail Page

In `SecretDetail.tsx`, add an "x402 Activity" section showing:
- Total x402 spend (today / this week / all time)
- Number of x402 calls
- Recent x402 transactions (service, cost, time)
- Link to full history

### Skills Page

Update `Skills.tsx` to list x402 as an available skill with its catalog of services.

## SKILL.md Documentation

The agent-facing documentation (`skills/x402/SKILL.md`) will cover:

1. What x402 is and why the agent should use it
2. How to discover available services via `/api/skills/x402/discover`
3. How to call a paid service via `/api/skills/x402/fetch`
4. How to check remaining budget via `/api/skills/x402/balance`
5. Example workflows: "get crypto prices", "search the web", "parse a document"
6. What happens when a policy blocks a call
7. How to tell the user to fund the wallet with USDC on Base

## Wallet Funding

x402 payments happen on **Base** (Coinbase's L2) in **USDC**. The agent's EVM wallet needs USDC on Base to pay for x402 calls. This works with the existing infrastructure:

- The wallet can already receive USDC transfers (it has a smart account address)
- The user can send USDC to the wallet address from any exchange or wallet
- The agent can check its Base USDC balance via the existing `/api/skills/evm-wallet/balances?chainIds=8453` endpoint, or via the new `/api/skills/x402/balance` endpoint

No new funding infrastructure is needed — just documentation guiding users to fund the wallet with USDC on Base.

## Rollout Plan

### Phase 1: Core Skill (MVP)

- `POST /api/skills/x402/fetch` — call any x402 endpoint
- `GET /api/skills/x402/discover` — browse the Bazaar
- `GET /api/skills/x402/balance` — check USDC + spending
- `GET /api/skills/x402/history` — past purchases
- `X402_SERVICE_ALLOWLIST` policy type
- `X402_SPENDING_LIMIT` policy type
- Policy manager UI updates
- SKILL.md documentation
- E2E tests (against Base Sepolia testnet x402 services)

### Phase 2: Enhanced Discovery & UX

- Curated service catalog with categories, descriptions, and input/output schemas (seed from Bazaar, enrich manually)
- Frontend "x402 Services" page showing available services with docs links
- Dashboard widget showing x402 spend trends
- Webhook/Telegram notifications for x402 spending milestones

### Phase 3: Smart Routing (Future)

- Agent says "search the web for X" → Vincent auto-routes to the best x402 search service
- Semantic matching: map agent intents to x402 service capabilities
- Cost optimization: choose cheapest service that meets quality requirements
- Fallback chains: if primary service is down, try alternatives

## Environment Variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `X402_DEFAULT_NETWORK` | No | `eip155:8453` (Base mainnet) | Default chain for x402 payments |
| `X402_FACILITATOR_URL` | No | CDP default | Override facilitator endpoint |
| `X402_BAZAAR_URL` | No | `https://api.cdp.coinbase.com/platform/v2/x402` | Bazaar discovery API base URL |

## Testing Strategy

### Unit Tests
- Policy evaluation for `X402_SERVICE_ALLOWLIST` (domain matching, wildcard, approvalOverride)
- Policy evaluation for `X402_SPENDING_LIMIT` (per-call, daily, weekly window calculations)
- URL domain extraction edge cases
- Cost extraction from x402 response headers

### E2E Tests (`src/e2e/x402.e2e.test.ts`)
- Create EVM_WALLET → call x402 discover → call x402 fetch against a Base Sepolia test endpoint
- Verify policy denial (set allowlist, call unlisted service)
- Verify spending limit enforcement
- Verify transaction logging

### Skill CI (`skill-ci/src/tests/x402.test.ts`)
- Give the LLM agent the x402 SKILL.md and let it discover services, check balance, and make an x402 call

## Open Questions

1. **Pre-flight cost estimation**: The x402 protocol doesn't expose price before the first request (you get it from the 402 response). Should we do a HEAD/probe request first to get the price for policy evaluation, or accept that the first request might fail policy after receiving the 402? The Bazaar metadata includes price info, so we could cache Bazaar prices and use them for pre-flight policy checks.

2. **Network support**: x402 supports Base (EVM) and Solana. Phase 1 targets Base only (our wallets are EVM). Solana support could come later via RAW_SIGNER integration.

3. **Approval flow for x402**: When a call needs approval, the 402 handshake hasn't happened yet (we check policy before making the request). After approval, we'd need to execute the full flow. Should the approved request be retried automatically (like the current transfer approval flow), or should the agent re-submit?
