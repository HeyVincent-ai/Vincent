# x402 Skill - Product Plan

## Overview

x402 is an open payment protocol (created by Coinbase, co-governed with Cloudflare) that uses the HTTP 402 status code to enable machine-to-machine micropayments over standard HTTP. An agent hits a paid API, gets a 402 response with payment requirements, signs a USDC transfer authorization, retries with the signature, and gets the data — all in one round-trip. No accounts, no API keys, no KYC. Just a wallet with USDC.

The x402 ecosystem includes a growing catalog of paid API services — CoinGecko (crypto data), Exa (AI search), OpenRouter (LLM gateway), Reducto (document parsing), Apollo (sales prospecting), Nyne (person search), Dome (prediction markets), and many more. These services are discoverable via the **Bazaar**, a public discovery API at `api.cdp.coinbase.com`.

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

---

## Getting Started: User Journey

This is the end-to-end flow a user follows to get their agent calling x402 services. It's designed to be as frictionless as possible — if the user already has a Vincent wallet, they just fund it and go.

### For Users Who Already Have a Vincent Wallet

```
1. Fund wallet with USDC on Base
   └── Send USDC to your wallet's smart account address from any exchange or wallet
       (address visible on your wallet detail page)

2. (Optional) Set x402 policies
   └── Go to your wallet → Policies tab → add service allowlist and/or spending limit

3. Agent calls x402 services
   └── Agent uses the same ssk_ API key it already has
       POST /api/skills/x402/fetch { url: "https://x402.coingecko.com/..." }
```

That's it. No new account, no new API key, no new setup. The agent's existing wallet pays for x402 calls.

### For New Users

```
1. Agent creates a wallet
   └── POST /api/secrets { type: "EVM_WALLET", memo: "My agent" }
       Returns: ssk_ API key + claim URL

2. User claims the wallet
   └── Opens claim URL → logs in → wallet appears on dashboard

3. User funds wallet with USDC on Base
   └── Dashboard shows wallet address + "Fund with USDC" prompt
       (see "Funding UX" section below)

4. (Optional) User sets x402 policies
   └── Wallet detail → Policies tab → x402 Service Allowlist / Spending Limit

5. Agent discovers and calls x402 services
   └── GET  /api/skills/x402/discover  → browse available services
       POST /api/skills/x402/fetch     → call a paid service
       GET  /api/skills/x402/balance   → check remaining budget
```

### For Users Browsing the Catalog First

The public `/skills` page and the authenticated wallet detail page both surface the x402 service catalog so users can explore what's available before funding.

```
1. Browse x402 services
   └── heyvincent.ai/skills → x402 tab → see all available paid APIs with prices

2. Create or select a wallet
   └── Dashboard → New Account → Smart Wallet
       (or pick an existing wallet)

3. Fund with USDC on Base

4. Set policies (optional but recommended for production agents)

5. Give agent the ssk_ key (or agent already has it)
```

---

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

**Response (insufficient funds):** `402`
```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_USDC",
    "message": "Wallet has $0.42 USDC on Base but this service costs ~$0.50. Fund your wallet with USDC on Base.",
    "details": {
      "balance": "0.42",
      "estimatedCost": "0.50",
      "walletAddress": "0x...",
      "network": "base"
    }
  }
}
```

### `GET /api/skills/x402/discover`

Browse available x402 services from the Bazaar discovery API. No auth required — this is also served publicly for the frontend catalog.

**Auth:** Optional `Authorization: Bearer ssk_xxx`

**Query params:**
- `limit` (number, default 50) — max results
- `category` (string, optional) — filter by category (e.g. "data", "search", "llm", "image", "prospect", "predict", "parse", "ecommerce")
- `maxPrice` (string, optional) — max price per call in USD (e.g. "0.01")
- `search` (string, optional) — text search across service names and descriptions

**Response:** `200`
```json
{
  "success": true,
  "data": {
    "services": [
      {
        "name": "CoinGecko",
        "category": "data",
        "description": "On-demand crypto price and market data via x402",
        "endpoints": [
          {
            "resource": "https://x402.coingecko.com/api/v3/simple/price",
            "method": "GET",
            "price": "0.001",
            "priceCurrency": "USDC",
            "network": "base",
            "description": "Get token prices"
          }
        ],
        "docsUrl": "https://docs.coingecko.com/x402"
      },
      {
        "name": "Exa",
        "category": "search",
        "description": "AI-powered web search, content retrieval, and research",
        "endpoints": [ ... ],
        "docsUrl": "https://docs.exa.ai"
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

---

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
  x402EstimatedCost?: number; // Estimated USDC cost (from Bazaar cache)
}
```

The policy checker gains two new branches:
1. **`X402_SERVICE_ALLOWLIST`** — check `action.x402Domain` against `config.domains`
2. **`X402_SPENDING_LIMIT`** — check `action.x402EstimatedCost` against per-call max; sum recent x402 `TransactionLog` entries against daily/weekly limits

Existing policies (`ADDRESS_ALLOWLIST`, `SPENDING_LIMIT_DAILY`, etc.) are **ignored** for `x402_fetch` actions — they don't apply (there's no "to" address or token amount in the traditional sense). The existing `REQUIRE_APPROVAL` policy DOES still apply to x402 actions if set.

---

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

---

## Frontend / UI

### Where Everything Lives

x402 touches four areas of the UI. The goal is to make it feel like a natural extension of the existing wallet experience, not a separate product bolted on.

```
Public pages (no auth)                    Authenticated pages (Layout w/ sidebar)
┌──────────────────────┐                  ┌────────────────────────────────────┐
│  /skills             │                  │  /dashboard                        │
│   └─ x402 skill tab  │                  │   └─ wallet cards show x402 badge  │
│      + service catalog│                  │                                    │
│                      │                  │  /secrets/:id  (wallet detail)     │
│  /                   │                  │   ├─ Overview tab: x402 section    │
│   └─ landing hero    │                  │   ├─ Policies tab: x402 policies   │
│      + capability card│                  │   └─ Audit Logs: x402 entries     │
│                      │                  │                                    │
│  /features           │                  │                                    │
│   └─ x402 feature    │                  │                                    │
│      section         │                  │                                    │
└──────────────────────┘                  └────────────────────────────────────┘
```

### 1. Skills Page (`/skills`) — Service Catalog & Install

**What changes:** Add `'x402'` as a third `SkillChoice` alongside `'wallet'` and `'polymarket'`.

When the user selects the x402 tab, the install card shows:

```
┌────────────────────────────────────────────────┐
│                                                │
│   [clawhub]  [other agents]     (method tabs)  │
│                                                │
│   [agent wallet]  [polymarket]  [x402]         │
│                                                │
│  ┌──────────────────────────────────────────┐  │
│  │ npx clawhub@latest install vincentx402   │  │
│  └──────────────────────────────────────────┘  │
│                                                │
│  1. Run this command to install the x402 skill │
│  2. Create a wallet or use your existing one   │
│  3. Fund with USDC on Base — your agent pays   │
│     per-call, starting at $0.001               │
│                                                │
└────────────────────────────────────────────────┘
```

Below the install card, when x402 is selected, show the **Service Catalog** — a grid of available x402 services grouped by category:

```
┌─────────────────────────────────────────────────────────────────┐
│  ⟩ Available Services                                           │
│                                                                 │
│  DATA                                                           │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │ CoinGecko       │  │ Auor            │  │ Gloria AI       │ │
│  │ Crypto prices & │  │ Place search &  │  │ Real-time news  │ │
│  │ market data     │  │ details         │  │ data            │ │
│  │ from $0.001/call│  │ from $0.001/call│  │ from $0.001/call│ │
│  │         [Docs →]│  │         [Docs →]│  │         [Docs →]│ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
│                                                                 │
│  SEARCH                                                         │
│  ┌─────────────────┐                                            │
│  │ Exa             │                                            │
│  │ AI-powered web  │                                            │
│  │ search          │                                            │
│  │ from $0.001/call│                                            │
│  │         [Docs →]│                                            │
│  └─────────────────┘                                            │
│                                                                 │
│  LLM           PROSPECT          PREDICT          IMAGE         │
│  ...           ...               ...              ...           │
│                                                                 │
│  142 services available · Prices are per-call in USDC on Base   │
└─────────────────────────────────────────────────────────────────┘
```

The catalog data comes from `GET /api/skills/x402/discover` (public, no auth needed). It's fetched client-side when the x402 tab is selected.

Also add to the **Connectors** section (alongside "EVM smart contract wallet", "Raw Ethereum & Solana signing", "Polymarket"):

```
x402 HTTP Payments ● live
  └─ tooltip: "Pay for any x402-enabled API with USDC micropayments.
     Your agent discovers services, calls them, and pays per-request —
     no API keys or accounts needed. 140+ services available."
```

And add to the **EVM Wallet Features** pill list:

```
[Transfers]  [Swaps]  [Any Transaction]  [x402 Payments]
```

### 2. Wallet Detail Page (`/secrets/:id`) — Per-Wallet x402 Experience

This is the primary place a user configures and monitors x402 for their wallet.

#### Overview Tab — x402 Section

Add an **x402 Payments** section to the Overview tab for `EVM_WALLET` secrets, placed between BalancesDisplay and Mainnet Access. This section has three states:

**State A: Not funded (no USDC on Base)**
```
┌─────────────────────────────────────────────────────────────┐
│  ⚡ x402 Payments                                           │
│                                                             │
│  Your agent can pay for 140+ APIs using x402 micropayments. │
│  Fund this wallet with USDC on Base to get started.         │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Smart Account Address (Base)                       │    │
│  │  0x1234...5678                    [Copy] [QR Code]  │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  Send USDC on the Base network to this address.             │
│  Deposits are available immediately.                        │
│                                                             │
│  [Browse available services →]                              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**State B: Funded, no x402 activity yet**
```
┌─────────────────────────────────────────────────────────────┐
│  ⚡ x402 Payments                              $12.45 USDC  │
│                                                             │
│  Ready to go. Your agent can call any x402 service.         │
│                                                             │
│  No x402 calls yet.                                         │
│                                                             │
│  Tip: Set an x402 Spending Limit policy to control how much │
│  your agent can spend per day. [Go to Policies →]           │
│                                                             │
│  [Browse available services →]                              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**State C: Active — spending stats + recent calls**
```
┌─────────────────────────────────────────────────────────────┐
│  ⚡ x402 Payments                              $12.45 USDC  │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │
│  │  Today   │  │ This Week│  │ All Time │                  │
│  │  $0.34   │  │  $2.10   │  │  $15.80  │                  │
│  │  340 calls│  │ 2.1k calls│ │ 15.8k   │                  │
│  └──────────┘  └──────────┘  └──────────┘                  │
│                                                             │
│  Recent calls                                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ ● CoinGecko   simple/price      $0.001   2 min ago │    │
│  │ ● Exa         search            $0.003   5 min ago │    │
│  │ ● CoinGecko   coins/markets     $0.001  12 min ago │    │
│  │ ✕ OpenRouter   chat/completions  denied  15 min ago │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  [View all x402 activity →]  (links to Audit Logs tab       │
│                               filtered to x402 actions)     │
└─────────────────────────────────────────────────────────────┘
```

Data source: `GET /api/skills/x402/balance` (server-side, scoped to the wallet's secret ID). The balance endpoint aggregates spending from `TransactionLog` where `actionType = 'x402_fetch'`. Recent calls come from `GET /api/skills/x402/history?limit=5`.

#### Policies Tab — x402 Policy Types

Add two new entries to the `POLICY_TYPES` array in `PolicyManager.tsx`:

```typescript
{
  value: 'X402_SERVICE_ALLOWLIST',
  label: 'x402 Service Allowlist',
  configKey: 'domains',
  isArray: true,
  placeholder: 'x402.coingecko.com, exa.ai, api.openrouter.ai',
  supportsApprovalOverride: true,
  description: 'Only allow x402 payments to these domains'
},
{
  value: 'X402_SPENDING_LIMIT',
  label: 'x402 Spending Limit',
  configKey: null, // Custom form — three optional number fields
  isCustom: true,
  supportsApprovalOverride: true,
  description: 'Limit how much the agent can spend on x402 services'
}
```

The x402 Spending Limit needs a **custom form** (unlike the existing single-value policies) because it has three optional fields:

```
┌─────────────────────────────────────────────────────────────┐
│  x402 Spending Limit                                        │
│                                                             │
│  Max per call   [$_____] USDC   (leave empty for no limit)  │
│  Max per day    [$_____] USDC                               │
│  Max per week   [$_____] USDC                               │
│                                                             │
│  ☐ Route to approval instead of denying                     │
│                                                             │
│  [Create Policy]                                            │
└─────────────────────────────────────────────────────────────┘
```

The x402 Service Allowlist uses the same comma-separated input pattern as the existing Address Allowlist, but with a helper label: "Enter domains of x402 services your agent can use."

When no x402 policies are set, the Policies tab shows a contextual hint:

```
No x402 policies configured — your agent can call any x402 service with no spending limit.
Recommended: add an x402 Spending Limit to control costs.
```

#### Audit Logs Tab — x402 Entries

No component changes needed. x402 actions will appear automatically via the existing `AuditLogViewer`:
- Action name: `skill.x402.fetch`, `skill.x402.discover`, `skill.x402.balance`
- The action dropdown filter will auto-populate these values from `getAuditLogActions()`
- Input data: shows the target URL, method
- Output data: shows cost, service response status

### 3. Dashboard (`/dashboard`) — x402 Status on Wallet Cards

Each wallet card in the Accounts list currently shows the wallet name and balance. Add a subtle x402 indicator:

```
┌─────────────────────────────────────────────┐
│  My Agent Wallet                   $1,234.56│
│  Smart Wallet · Created Feb 18     ⚡ x402  │
└─────────────────────────────────────────────┘
```

The `⚡ x402` badge appears only if the wallet has a non-zero USDC balance on Base (meaning it's capable of x402 payments). This is a lightweight indicator — no new API call needed, since `getSecretBalances()` already returns per-token balances.

For the Overview Card at the top of the dashboard, optionally add x402 spending to the summary:

```
┌───────────────────────────────────────────────────────┐
│  Total Assets          Total Accounts     x402 Today  │
│  $12,345.67            4                  $0.34       │
└───────────────────────────────────────────────────────┘
```

### 4. Landing Page (`/`) — Marketing

Add to the **Capabilities** grid (6 → 7 cards or replace one):

```
┌─────────────────────────────────────┐
│  x402 API Payments                  │
│                                     │
│  Your agent pays for any x402 API   │
│  with USDC micropayments — no keys, │
│  no accounts. 140+ services from    │
│  $0.001/call.                       │
└─────────────────────────────────────┘
```

Add to the **hero carousel** a fourth scenario card:

```
Phase 1: "Agent needs CoinGecko data"
Phase 2: "x402 payment: $0.001 USDC → CoinGecko"
Phase 3: "Data received: ETH $3,200.50"
```

Add to the **FAQ**:

```
Q: How does my agent pay for external APIs?
A: Vincent supports x402, an open payment protocol. Your agent discovers paid APIs,
   calls them, and pays per-request with USDC micropayments from its wallet.
   No API keys or accounts needed — just fund your wallet with USDC on Base.
   140+ services available including CoinGecko, Exa, OpenRouter, and more.
```

### 5. Features Page (`/features`) — Deep Dive Section

Add a new feature section (after "Policy Engine", before "Works With Any Agent"):

```
┌─────────────────────────────────────────────────────────────────┐
│  x402 HTTP Payments                                             │
│                                                                 │
│  Your agent pays for APIs the way the web intended: per-request,│
│  instantly, with no accounts or API keys. Vincent handles the   │
│  x402 payment protocol automatically — the agent just calls the │
│  API and gets the data.                                         │
│                                                                 │
│  ┌─────────────────────────────────────────────────────┐        │
│  │  Agent → Vincent → x402 Service                     │        │
│  │  ┌───────┐    ┌───────┐    ┌───────────────┐       │        │
│  │  │Request│───▶│Policy │───▶│Pay + Fetch    │       │        │
│  │  │       │    │Check  │    │($0.001 USDC)  │       │        │
│  │  └───────┘    └───────┘    └───────┬───────┘       │        │
│  │                                    │               │        │
│  │                              ┌─────▼─────┐         │        │
│  │                              │  Response  │         │        │
│  │                              │  returned  │         │        │
│  │                              └───────────┘         │        │
│  └─────────────────────────────────────────────────────┘        │
│                                                                 │
│  140+ services · From $0.001/call · USDC on Base                │
└─────────────────────────────────────────────────────────────────┘
```

### Funding UX

The wallet detail Overview tab has a funding prompt (described in State A above). To make this as clear as possible:

1. **Show the Base network explicitly** — users often have USDC on Ethereum mainnet but need it on Base. The UI should say "Send USDC on the **Base** network" with emphasis.
2. **QR code** — for scanning from mobile wallets or exchange apps.
3. **Copy address button** — one-click copy of the smart account address.
4. **Balance refresh** — after funding, the user can refresh to see the updated balance immediately.
5. **Link to bridge** — if the user has USDC on another chain, link to a bridge (e.g., Coinbase Bridge, Across Protocol) to move it to Base.

We do NOT need:
- An in-app fiat on-ramp (too complex for MVP, users can buy USDC on Coinbase/other exchanges)
- Automatic funding from another chain (Phase 2 potential feature)
- A minimum balance requirement (the agent will get clear error messages if funds run out)

---

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
| `frontend/src/components/X402Section.tsx` | x402 overview section for wallet detail |
| `frontend/src/components/X402ServiceCatalog.tsx` | Service catalog grid component |

### Modified Files

| File | Change |
|------|--------|
| `src/api/routes/index.ts` | Add `router.use('/skills/x402', x402Router)` |
| `src/skills/index.ts` | Add `export * as x402 from './x402.service.js'` |
| `prisma/schema.prisma` | Add `X402_SERVICE_ALLOWLIST` and `X402_SPENDING_LIMIT` to `PolicyType` enum |
| `src/policies/checker.ts` | Add x402 policy evaluation branches |
| `src/services/policy.service.ts` | Add x402 policy config types and validation |
| `src/utils/env.ts` | Add optional x402 env vars |
| `frontend/src/api.ts` | Add `getX402Balance()`, `getX402History()`, `getX402Services()` API functions |
| `frontend/src/components/PolicyManager.tsx` | Add `X402_SERVICE_ALLOWLIST` and `X402_SPENDING_LIMIT` to `POLICY_TYPES` array, add custom form for spending limit |
| `frontend/src/pages/SecretDetail.tsx` | Import and render `<X402Section>` in Overview tab for EVM_WALLET |
| `frontend/src/pages/Skills.tsx` | Add `'x402'` to `SkillChoice`, add service catalog, add connector pill, add wallet feature pill |
| `frontend/src/pages/Dashboard.tsx` | Add x402 badge on wallet cards when USDC balance exists on Base |
| `frontend/src/pages/Landing.tsx` | Add capability card, carousel scenario, FAQ entry |
| `frontend/src/pages/Features.tsx` | Add x402 feature section |

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
import { type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import prisma from '../db/client.js';
import { AppError } from '../api/middleware/errorHandler.js';
import { checkPolicies, type PolicyCheckAction } from '../policies/checker.js';
import { sendApprovalRequest } from '../telegram/index.js';

// ============================================================
// Types
// ============================================================

export interface X402FetchInput {
  secretId: string;
  apiKeyId?: string;
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface X402FetchOutput {
  status: 'executed' | 'pending_approval' | 'denied';
  cost?: string;
  costCurrency?: string;
  network?: string;
  serviceResponse?: unknown;
  reason?: string;
  transactionLogId: string;
}

// ============================================================
// Helpers
// ============================================================

async function getWalletData(secretId: string) {
  const secret = await prisma.secret.findFirst({
    where: { id: secretId, deletedAt: null },
    include: { walletMetadata: true },
  });
  if (!secret || secret.type !== 'EVM_WALLET' || !secret.value) {
    throw new AppError('INVALID_SECRET', 'x402 requires an EVM_WALLET secret', 400);
  }
  return {
    privateKey: secret.value as Hex,
    smartAccountAddress: secret.walletMetadata!.smartAccountAddress,
  };
}

function createX402Fetch(privateKey: Hex) {
  const signer = privateKeyToAccount(privateKey);
  const client = new x402Client();
  registerExactEvmScheme(client, { signer });
  return wrapFetchWithPayment(fetch, client);
}

// ============================================================
// Actions
// ============================================================

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
      requestData: { url: input.url, method: input.method || 'GET', domain },
      status: policyResult.verdict === 'allow' ? 'PENDING' : 'DENIED',
    },
  });

  // 3. Handle deny
  if (policyResult.verdict === 'deny') {
    await prisma.transactionLog.update({
      where: { id: txLog.id },
      data: { status: 'DENIED', responseData: { reason: policyResult.triggeredPolicy?.reason } },
    });
    return {
      status: 'denied',
      reason: policyResult.triggeredPolicy?.reason,
      transactionLogId: txLog.id,
    };
  }

  // 4. Handle require_approval
  if (policyResult.verdict === 'require_approval') {
    const pendingApproval = await prisma.pendingApproval.create({
      data: { transactionLogId: txLog.id, expiresAt: new Date(Date.now() + 30 * 60 * 1000) },
    });
    await prisma.transactionLog.update({ where: { id: txLog.id }, data: { status: 'PENDING' } });
    sendApprovalRequest(pendingApproval.id).catch((err) =>
      console.error('Failed to send x402 approval request:', err)
    );
    return {
      status: 'pending_approval',
      reason: policyResult.triggeredPolicy?.reason,
      transactionLogId: txLog.id,
    };
  }

  // 5. Execute x402 fetch
  try {
    const fetchWithPayment = createX402Fetch(wallet.privateKey);
    const response = await fetchWithPayment(input.url, {
      method: input.method || 'GET',
      headers: input.headers,
      body: input.body ? JSON.stringify(input.body) : undefined,
    });

    const cost = extractCostFromResponse(response);
    const serviceResponse = await response.json();

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
      network: 'base',
      serviceResponse,
      transactionLogId: txLog.id,
    };
  } catch (error) {
    await prisma.transactionLog.update({
      where: { id: txLog.id },
      data: { status: 'FAILED', responseData: { error: String(error) } },
    });
    throw error;
  }
}

function extractCostFromResponse(response: Response): number {
  // Parse PAYMENT-RESPONSE header for settlement cost
  // Falls back to 0 if header is missing
  const paymentResponse = response.headers.get('payment-response');
  if (!paymentResponse) return 0;
  try {
    const parsed = JSON.parse(paymentResponse);
    // Amount is in atomic USDC units (6 decimals)
    return Number(parsed.amount) / 1_000_000;
  } catch {
    return 0;
  }
}

export async function discoverServices(params: {
  limit?: number;
  category?: string;
  maxPrice?: string;
  search?: string;
}): Promise<{ services: unknown[]; total: number }> {
  const bazaarUrl = process.env.X402_BAZAAR_URL || 'https://api.cdp.coinbase.com/platform/v2/x402';
  const url = new URL(`${bazaarUrl}/discovery/resources`);
  url.searchParams.set('type', 'http');
  url.searchParams.set('limit', String(params.limit || 50));

  const response = await fetch(url.toString());
  const data = await response.json();

  let items = data.items || [];

  // Client-side filtering (Bazaar API has limited filter support)
  if (params.maxPrice) {
    const maxPriceAtoms = parseFloat(params.maxPrice) * 1_000_000;
    items = items.filter((item: any) => {
      const amount = item.accepts?.[0]?.amount;
      return !amount || Number(amount) <= maxPriceAtoms;
    });
  }

  if (params.search) {
    const q = params.search.toLowerCase();
    items = items.filter((item: any) =>
      item.metadata?.description?.toLowerCase().includes(q) ||
      item.resource?.toLowerCase().includes(q)
    );
  }

  return {
    services: items.map(formatBazaarItem),
    total: items.length,
  };
}

export async function getBalance(secretId: string) {
  const wallet = await getWalletData(secretId);

  // Get USDC balance on Base (chain ID 8453)
  // Reuse existing balance infrastructure
  const balances = await getUsdcBalanceOnBase(wallet.smartAccountAddress);

  // Aggregate x402 spending from transaction logs
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [todaySpend, weekSpend, allTimeSpend, todayCount, weekCount, allTimeCount] =
    await Promise.all([
      sumX402Spend(secretId, dayAgo),
      sumX402Spend(secretId, weekAgo),
      sumX402Spend(secretId, null),
      countX402Calls(secretId, dayAgo),
      countX402Calls(secretId, weekAgo),
      countX402Calls(secretId, null),
    ]);

  return {
    usdcBalance: balances.toString(),
    network: 'base',
    smartAccountAddress: wallet.smartAccountAddress,
    spending: { today: todaySpend, thisWeek: weekSpend, allTime: allTimeSpend },
    callCount: { today: todayCount, thisWeek: weekCount, allTime: allTimeCount },
  };
}

export async function getHistory(secretId: string, limit = 20, offset = 0) {
  const [transactions, total] = await Promise.all([
    prisma.transactionLog.findMany({
      where: { secretId, actionType: 'x402_fetch' },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.transactionLog.count({
      where: { secretId, actionType: 'x402_fetch' },
    }),
  ]);

  return {
    transactions: transactions.map((tx) => ({
      id: tx.id,
      url: (tx.requestData as any)?.url,
      service: (tx.requestData as any)?.domain,
      cost: tx.usdValue?.toString() || '0',
      status: tx.status,
      createdAt: tx.createdAt.toISOString(),
    })),
    total,
  };
}
```

### Route File (`src/api/routes/x402.routes.ts`)

Standard Express router with Zod validation:

```typescript
import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../types/index.js';
import { apiKeyAuthMiddleware } from '../middleware/apiKeyAuth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { sendSuccess, errors } from '../../utils/response.js';
import * as x402Service from '../../skills/x402.service.js';
import { auditService } from '../../audit/index.js';

const router = Router();

// x402 skill routes require API key auth (except discover, which is public)
router.use(apiKeyAuthMiddleware);

// POST /api/skills/x402/fetch
const fetchSchema = z.object({
  url: z.string().url(),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).default('GET'),
  headers: z.record(z.string()).optional(),
  body: z.any().optional(),
});

router.post('/fetch', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const body = fetchSchema.parse(req.body);
  if (!req.secret) { errors.unauthorized(res, 'No secret associated with API key'); return; }

  const start = Date.now();
  const result = await x402Service.executeFetch({
    secretId: req.secret.id,
    apiKeyId: req.apiKey?.id,
    ...body,
  });

  auditService.log({
    secretId: req.secret.id,
    apiKeyId: req.apiKey?.id,
    action: 'skill.x402.fetch',
    inputData: { url: body.url, method: body.method },
    outputData: { status: result.status, cost: result.cost },
    status: result.status === 'denied' ? 'FAILED' : result.status === 'pending_approval' ? 'PENDING' : 'SUCCESS',
    errorMessage: result.status === 'denied' ? result.reason : undefined,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    durationMs: Date.now() - start,
  });

  const statusCode = result.status === 'executed' ? 200 : result.status === 'denied' ? 403 : 202;
  sendSuccess(res, result, statusCode);
}));

// GET /api/skills/x402/discover
router.get('/discover', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await x402Service.discoverServices({
    limit: req.query.limit ? Number(req.query.limit) : undefined,
    category: req.query.category as string | undefined,
    maxPrice: req.query.maxPrice as string | undefined,
    search: req.query.search as string | undefined,
  });
  sendSuccess(res, result);
}));

// GET /api/skills/x402/balance
router.get('/balance', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.secret) { errors.unauthorized(res, 'No secret associated with API key'); return; }
  const result = await x402Service.getBalance(req.secret.id);
  sendSuccess(res, result);
}));

// GET /api/skills/x402/history
router.get('/history', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.secret) { errors.unauthorized(res, 'No secret associated with API key'); return; }
  const result = await x402Service.getHistory(
    req.secret.id,
    req.query.limit ? Number(req.query.limit) : undefined,
    req.query.offset ? Number(req.query.offset) : undefined,
  );
  sendSuccess(res, result);
}));

export default router;
```

---

## SKILL.md Documentation

The agent-facing documentation (`skills/x402/SKILL.md`) will cover:

1. What x402 is and why the agent should use it
2. How to discover available services via `/api/skills/x402/discover`
3. How to call a paid service via `/api/skills/x402/fetch`
4. How to check remaining budget via `/api/skills/x402/balance`
5. Example workflows: "get crypto prices", "search the web", "parse a document"
6. What happens when a policy blocks a call
7. How to tell the user to fund the wallet with USDC on Base
8. Full API reference with curl examples for each endpoint

---

## Wallet Funding

x402 payments happen on **Base** (Coinbase's L2) in **USDC**. The agent's EVM wallet needs USDC on Base to pay for x402 calls. This works with the existing infrastructure:

- The wallet can already receive USDC transfers (it has a smart account address)
- The user can send USDC to the wallet address from any exchange or wallet
- The agent can check its Base USDC balance via the existing `/api/skills/evm-wallet/balances?chainIds=8453` endpoint, or via the new `/api/skills/x402/balance` endpoint

No new funding infrastructure is needed — just documentation and UI prompts guiding users to fund the wallet with USDC on Base.

**Cost expectations for users:**
- Most x402 services cost $0.001–$0.01 per call
- A typical agent making 1,000 calls/day would cost $1–$10/day
- $10 USDC funds approximately 10,000 cheap API calls
- The policy engine lets users set hard daily caps to prevent runaway spending

---

## Rollout Plan

### Phase 1: Core Skill (MVP)

**Backend:**
- `POST /api/skills/x402/fetch` — call any x402 endpoint
- `GET /api/skills/x402/discover` — browse the Bazaar
- `GET /api/skills/x402/balance` — check USDC + spending
- `GET /api/skills/x402/history` — past purchases
- `X402_SERVICE_ALLOWLIST` policy type
- `X402_SPENDING_LIMIT` policy type
- SKILL.md documentation
- E2E tests (against Base Sepolia testnet x402 services)

**Frontend:**
- Skills page: x402 tab with install command + service catalog grid
- Wallet detail Overview: x402 Payments section (funding prompt / stats / recent calls)
- Wallet detail Policies: x402 Service Allowlist + Spending Limit form
- Skills page Connectors: "x402 HTTP Payments" pill
- API client functions in `api.ts`

### Phase 2: Enhanced Discovery & UX

- Curated service catalog with categories, descriptions, and input/output schemas (seed from Bazaar, enrich with manually authored metadata)
- Individual service detail pages/modals with docs, example requests, pricing
- Dashboard x402 badge on wallet cards
- Dashboard overview card with x402 spending stat
- Landing page capability card + hero carousel scenario
- Features page x402 section
- Telegram notifications for spending milestones (e.g., "Your agent has spent $5 on x402 today")

### Phase 3: Smart Routing (Future)

- Agent says "search the web for X" → Vincent auto-routes to the best x402 search service
- Semantic matching: map agent intents to x402 service capabilities
- Cost optimization: choose cheapest service that meets quality requirements
- Fallback chains: if primary service is down, try alternatives

---

## Environment Variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `X402_DEFAULT_NETWORK` | No | `eip155:8453` (Base mainnet) | Default chain for x402 payments |
| `X402_FACILITATOR_URL` | No | CDP default | Override facilitator endpoint |
| `X402_BAZAAR_URL` | No | `https://api.cdp.coinbase.com/platform/v2/x402` | Bazaar discovery API base URL |

---

## Testing Strategy

### Unit Tests
- Policy evaluation for `X402_SERVICE_ALLOWLIST` (domain matching, wildcard, approvalOverride)
- Policy evaluation for `X402_SPENDING_LIMIT` (per-call, daily, weekly window calculations)
- URL domain extraction edge cases
- Cost extraction from x402 response headers
- Bazaar response parsing and filtering

### E2E Tests (`src/e2e/x402.e2e.test.ts`)
- Create EVM_WALLET → call x402 discover → call x402 fetch against a Base Sepolia test endpoint
- Verify policy denial (set allowlist, call unlisted service)
- Verify spending limit enforcement
- Verify transaction logging
- Verify balance and history endpoints

### Skill CI (`skill-ci/src/tests/x402.test.ts`)
- Give the LLM agent the x402 SKILL.md and let it discover services, check balance, and make an x402 call

---

## Open Questions

1. **Pre-flight cost estimation**: The x402 protocol doesn't expose price before the first request (you get it from the 402 response). Should we do a HEAD/probe request first to get the price for policy evaluation, or accept that the first request might fail policy after receiving the 402? The Bazaar metadata includes price info, so we could cache Bazaar prices and use them for pre-flight policy checks. **Recommended: cache Bazaar prices, refresh hourly.**

2. **Network support**: x402 supports Base (EVM) and Solana. Phase 1 targets Base only (our wallets are EVM). Solana support could come later via RAW_SIGNER integration.

3. **Approval flow for x402**: When a call needs approval, the 402 handshake hasn't happened yet (we check policy before making the request). After approval, we'd need to execute the full flow. **Recommended: same pattern as transfer approvals — when approved, the backend retries the x402 fetch automatically.**

4. **Public discover endpoint**: Should `/api/skills/x402/discover` be public (no auth) so the frontend catalog works for unauthenticated visitors on `/skills`? **Recommended: yes, allow unauthenticated access for discover only.** All other endpoints require auth.
