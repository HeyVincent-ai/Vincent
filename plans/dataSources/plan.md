# Data Sources - Product Plan

## Overview

Data Sources is a feature that provides OpenClaw agents with pre-configured access to third-party APIs (Twitter/X, Brave Search, etc.) without requiring users to sign up for, configure, or manage those API keys themselves. Requests flow through our backend as a proxy — we authenticate the agent via our existing `ssk_` API key infrastructure, check the user's credit balance, forward the request to the upstream API using our key, log usage, and charge accordingly.

This is modeled as a **new secret type** (`DATA_SOURCES`) in our existing secrets system. This means it reuses all existing infrastructure: API key generation, claim flow, ownership, the secrets/accounts page in the frontend, etc. The agent authenticates with an `ssk_` API key scoped to a `DATA_SOURCES` secret, exactly like it would for an `EVM_WALLET` or `POLYMARKET_WALLET` secret.

## Problem Statement

OpenClaw users want their agents to access external data (tweets, web search results, etc.), but setting up API accounts with providers like X or Brave is:
1. Time-consuming (approval processes, developer accounts)
2. Confusing (API tiers, rate limits, billing setup)
3. Costly to start (minimum plan commitments)

We solve this by acting as a managed proxy: users get instant access, pay only for what they use, and we handle the upstream provider relationship.

## Architecture

```
┌──────────────────┐     ┌──────────────────────┐     ┌────────────────┐
│  OpenClaw Agent  │────▶│  Vincent Backend      │────▶│  Twitter API   │
│  (on user's VPS) │     │  (Data Source Proxy)  │     │  Brave API     │
│                  │     │                       │     │  [Future APIs] │
│  Runs clawhub    │     │  - Auth (ssk_ key)    │     └────────────────┘
│  skill that      │     │  - Credit check       │
│  calls our proxy │     │  - Usage logging      │
└──────────────────┘     │  - Rate limiting      │
                         │  - Request forwarding │
                         └──────────┬────────────┘
                                    │
                         ┌──────────┴────────────┐
                         │  Existing Secrets      │
                         │  Infrastructure        │
                         │  - API key auth        │
                         │  - Claim flow          │
                         │  - Ownership           │
                         │  - Secret detail page  │
                         └────────────────────────┘
```

### Request Flow

1. Agent (on OpenClaw VPS) invokes a data source skill function (e.g., "search tweets about Bitcoin")
2. The clawhub skill makes an HTTPS request to `https://heyvincent.ai/api/data-sources/twitter/search`
3. Request includes the agent's `ssk_` API key as `Authorization: Bearer ssk_...`
4. Backend validates API key → finds `DATA_SOURCES` secret → finds owning user
5. Backend checks: secret is claimed AND user has a credit card on file
6. Backend checks user's data source credit balance
7. If all checks pass: forwards request to upstream API (Twitter, Brave, etc.)
8. Logs usage in `DataSourceUsage` table, deducts cost from user's credit balance
9. Returns upstream response to the skill → agent

### Authentication

Data source proxy endpoints use the **existing `apiKeyAuth` middleware**, the same one used by EVM wallet and Polymarket skill endpoints. The API key is scoped to a `DATA_SOURCES` secret.

```
Authorization: Bearer ssk_<64 hex chars>
```

After API key validation, a data source-specific middleware checks:
1. `req.secret.type === 'DATA_SOURCES'` — correct secret type
2. `req.secret.userId !== null` — secret has been claimed
3. User has Stripe payment method on file (or has remaining free credit)
4. User has sufficient data source credit balance

This API key approach means:
- **Any agent** can use data sources (not just Vincent-deployed OpenClaw instances)
- The same claim/ownership flow used for wallets applies to data sources
- Skills can be published to clawhub and used by anyone with an `ssk_` key
- Future: non-OpenClaw agents can also consume data sources

### Secret Type: `DATA_SOURCES`

The `DATA_SOURCES` secret type has no actual secret value (unlike `EVM_WALLET` which stores a private key). The secret record exists purely to:
- Own the API key(s) used for data source access
- Link to a user account (via claim flow) for billing
- Appear on the user's secrets/accounts page in the frontend

When a `DATA_SOURCES` secret is created:
- `value` is `null` (no secret material)
- A claim token is generated (same as other types)
- An API key is returned to the agent

## Credit System

### Initial Credits
- Every user gets **$10.00 of free data source credit** upon first use
- Credit is tracked as a field on the `User` model: `dataSourceCreditUsd`

### Prerequisites for Usage
Data source requests are **blocked** until both conditions are met:
1. The `DATA_SOURCES` secret is **claimed** (associated with a user)
2. The user has a **credit card on file** (Stripe customer with payment method) — OR still has remaining free credit (first $10)

For Vincent-deployed OpenClaw instances, both conditions are met automatically during provisioning (secret is pre-claimed, user already has a card from paying for the deployment).

### Credit Balance
- Credit is **per-user** (not per-secret), since a user may have multiple agents
- All `DATA_SOURCES` secrets for a user draw from the same credit pool
- Usage is tracked per-secret and per-API-key for visibility

### Charging
- Each API call has a fixed cost (defined per data source, per endpoint type)
- Cost is deducted from `dataSourceCreditUsd` immediately after successful upstream call
- If credit balance would go negative, the request is **rejected** with a 402 Payment Required error

### Adding Credits
- Users add credits via the secret detail page for their DATA_SOURCES secret
- Charged to their Stripe payment method (off-session, like OpenClaw credits)
- Minimum $5, maximum $500 per purchase
- Creates a `DataSourceCreditPurchase` record for audit trail

### Pricing Per Data Source

**Twitter / X.com:**
| Endpoint | Cost per call |
|----------|--------------|
| Search tweets | $0.01 |
| Get tweet by ID | $0.005 |
| Get user profile | $0.005 |
| Get user tweets | $0.01 |

**Brave Search:**
| Endpoint | Cost per call |
|----------|--------------|
| Web search | $0.005 |
| News search | $0.005 |

> Prices are set with margin above our upstream cost. We can adjust as we learn actual usage patterns.

## Database Schema

### SecretType Enum

Add `DATA_SOURCES` to the existing enum:

```prisma
enum SecretType {
  EVM_WALLET
  POLYMARKET_WALLET
  RAW_SIGNER
  API_KEY
  SSH_KEY
  OAUTH_TOKEN
  DATA_SOURCES     // NEW
}
```

### New Field on `User`

```prisma
model User {
  // ... existing fields ...
  dataSourceCreditUsd  Decimal  @default(10.00) @db.Decimal(10, 2)
}
```

### New Models

```prisma
model DataSourceUsage {
  id              String    @id @default(uuid())
  userId          String
  secretId        String    // the DATA_SOURCES secret
  apiKeyId        String?   // which API key was used
  dataSource      String    // "twitter", "brave-search"
  endpoint        String    // "search", "get-tweet", "web-search", etc.
  costUsd         Decimal   @db.Decimal(10, 6)
  requestMetadata Json?     // optional: query params, result count, etc.
  createdAt       DateTime  @default(now())

  user            User      @relation(fields: [userId], references: [id])
  secret          Secret    @relation(fields: [secretId], references: [id])

  @@map("data_source_usage")
}

model DataSourceCreditPurchase {
  id                    String   @id @default(uuid())
  userId                String
  amountUsd             Decimal  @db.Decimal(10, 2)
  stripePaymentIntentId String   @unique
  createdAt             DateTime @default(now())

  user                  User     @relation(fields: [userId], references: [id])

  @@map("data_source_credit_purchases")
}
```

### Data Source Registry (Code-Defined)

Available data sources are defined in code as a typed config, not in the database:

```typescript
interface DataSourceConfig {
  id: string;            // "twitter", "brave-search"
  displayName: string;   // "Twitter / X.com"
  description: string;
  status: 'active' | 'coming_soon';
  endpoints: {
    [key: string]: {
      description: string;
      costUsd: number;
    };
  };
}
```

## Backend API

### Data Source Proxy Endpoints (API Key Auth)

All proxy endpoints are under `/api/data-sources/:dataSource/` and use existing `apiKeyAuth` middleware + a data-source-specific guard middleware.

**Twitter / X.com (`/api/data-sources/twitter/`):**
| Method | Path | Description | Upstream |
|--------|------|-------------|----------|
| GET | `/search` | Search recent tweets | `GET /2/tweets/search/recent` |
| GET | `/tweets/:tweetId` | Get tweet by ID | `GET /2/tweets/:id` |
| GET | `/users/:username` | Get user profile | `GET /2/users/by/username/:username` |
| GET | `/users/:userId/tweets` | Get user's tweets | `GET /2/users/:id/tweets` |

**Brave Search (`/api/data-sources/brave/`):**
| Method | Path | Description | Upstream |
|--------|------|-------------|----------|
| GET | `/web` | Web search | `GET /res/v1/web/search` |
| GET | `/news` | News search | `GET /res/v1/news/search` |

### Management Endpoints (Session Auth)

These are for the frontend, on the secret detail page for a `DATA_SOURCES` secret:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/secrets/:id/data-sources` | List available data sources with usage stats |
| GET | `/api/secrets/:id/data-sources/credits` | Get credit balance and recent purchases |
| POST | `/api/secrets/:id/data-sources/credits` | Add credits (Stripe off-session charge) |
| GET | `/api/secrets/:id/data-sources/usage` | Usage breakdown by data source and time period |

These reuse existing `sessionAuth` + `requireSecretOwnership` middleware.

### Rate Limiting

Per-API-key rate limiting on data source proxy endpoints:
- Twitter: 60 requests/minute per API key
- Brave Search: 60 requests/minute per API key

## Data Source Implementations

### Twitter / X.com

**Upstream API:** X API v2 (https://api.twitter.com/2/)

**Our API key:** We maintain a single X API developer account. All user requests are proxied through our Bearer token.

**What we expose to the agent:**
- Search tweets by query (with filters: date range, language, max_results)
- Get specific tweet details (text, author, metrics)
- Get user profile (bio, follower count, etc.)
- Get user's recent tweets

**What we add to responses:**
- `_vincent` metadata block with: cost charged, remaining credit balance

### Brave Search

**Upstream API:** Brave Search API (https://api.search.brave.com/)

**What we expose to the agent:**
- Web search with query, count, offset, freshness filters
- News search with similar parameters

## OpenClaw Integration

### Pre-provisioned Secrets (Vincent-Deployed Instances)

When a user deploys OpenClaw through Vincent, we **pre-create and pre-claim** all skill secrets during provisioning. This means the agent is ready to use all skills immediately with zero setup.

**During `provisionAsync()`, after VPS is ordered but before setup script runs:**

1. **Create `DATA_SOURCES` secret** → claim it to the deploying user → generate API key
2. **Create `EVM_WALLET` secret** → claim it to the deploying user → generate API key
3. **Create `POLYMARKET_WALLET` secret** → claim it to the deploying user → generate API key

All three API keys are passed to `buildSetupScript()` as parameters, which writes them as environment variables or credential files on the VPS.

**Updated `buildSetupScript()` signature:**
```typescript
function buildSetupScript(
  openRouterApiKey: string,
  hostname: string,
  vincentApiKeys: {
    dataSourcesKey: string;
    walletKey: string;
    polymarketKey: string;
  }
): string;
```

**In the setup script, after skill installation:**
```bash
# Write Vincent API keys for pre-installed skills
mkdir -p /root/.openclaw/credentials/agentwallet
cat > /root/.openclaw/credentials/agentwallet/default.json << KEYEOF
{"apiKey": "${vincentApiKeys.walletKey}", "host": "https://heyvincent.ai"}
KEYEOF

mkdir -p /root/.openclaw/credentials/vincentpolymarket
cat > /root/.openclaw/credentials/vincentpolymarket/default.json << KEYEOF
{"apiKey": "${vincentApiKeys.polymarketKey}", "host": "https://heyvincent.ai"}
KEYEOF

mkdir -p /root/.openclaw/credentials/vincentdata
cat > /root/.openclaw/credentials/vincentdata/default.json << KEYEOF
{"apiKey": "${vincentApiKeys.dataSourcesKey}", "host": "https://heyvincent.ai"}
KEYEOF
```

This means when a user deploys via Vincent:
- Agent wallet is ready immediately (no "create a vincent wallet" step)
- Polymarket is ready immediately
- Data sources are ready immediately
- All secrets appear on the user's Accounts page, already claimed
- User already has a credit card on file (from paying for the deployment)

### Self-Provisioned Flow (Non-Vincent OpenClaw or Standalone Agents)

For agents NOT deployed through Vincent, the existing flow still works:

1. Agent installs the data source skill from clawhub
2. Skill has no API key configured
3. Skill calls `POST /api/secrets` with `type: 'DATA_SOURCES'` to create a secret
4. Gets back `ssk_` API key + claim URL
5. Agent stores API key, presents claim URL to the user
6. User claims the secret, adds credit card
7. Now data source requests work

This is identical to how wallet and polymarket skills work today.

### Skill Packages

Each data source gets a clawhub skill package. These are thin wrappers that:
1. Read their `ssk_` API key from the credential file (pre-provisioned) or self-provision via `POST /api/secrets`
2. Make HTTPS requests to our proxy endpoints with `Authorization: Bearer ssk_...`
3. Return parsed results to the agent

**Skill installation** in `buildSetupScript()`:
```bash
npx --yes clawhub@latest install vincent-twitter || true
npx --yes clawhub@latest install vincent-brave-search || true
```

## Frontend

### No New Page — Reuse Secret Detail

Since `DATA_SOURCES` is a secret type, it appears on the existing **Accounts/Secrets** page alongside wallets and other secrets. The secret detail page (`/secrets/:id`) is extended with a `DATA_SOURCES`-specific view.

**Secret Detail for DATA_SOURCES shows:**

1. **Credit Balance Section** (replaces wallet balance for this type)
   - Current credit balance with progress bar
   - "Add Credits" button (same pattern as OpenClaw credit addition)
   - Color coding: green (>$5), yellow ($2-$5), red (<$2)

2. **Available Data Sources** (new component, shown for DATA_SOURCES type)
   - Card per data source: name, description, pricing, current month usage
   - "Coming soon" badges for inactive sources

3. **Usage History**
   - Monthly breakdown of data source usage (requests, cost)

4. **Existing tabs still work:**
   - API Keys tab — manage `ssk_` keys for this data source secret
   - Audit Logs tab — shows all data source requests logged

### Dashboard

The dashboard already shows all secrets. `DATA_SOURCES` secrets will appear with a "Data Sources" type badge, similar to how "EVM Wallet" and "Polymarket" badges work.

## Environment Variables

New env vars:
```
TWITTER_BEARER_TOKEN=        # X API v2 Bearer token
BRAVE_SEARCH_API_KEY=        # Brave Search API key
```

Both optional — if not configured, the respective data source returns 503 Service Unavailable.

## Security Considerations

1. **Upstream API keys** never exposed to agents — only exist on our backend
2. **`ssk_` API keys** are bcrypt-hashed in DB, shown only once on creation
3. **Claim + credit card required** before any data source usage
4. **Credit checks** happen before upstream calls — no risk of unbounded charges
5. **Rate limiting** prevents abuse even within credit limits
6. **Request logging** provides full audit trail (DataSourceUsage + AuditLog)
7. **Input validation** on all proxy endpoints via Zod

## Adding New Data Sources (Future Pattern)

To add a new data source:

1. **Define config** in `src/dataSources/registry.ts` — add entry with id, name, endpoints, pricing
2. **Create handler** in `src/dataSources/<name>/handler.ts` — proxy functions for each endpoint
3. **Create routes** in `src/dataSources/<name>/routes.ts` — Express routes calling the handler
4. **Register routes** in the data sources router
5. **Create clawhub skill** — thin wrapper calling our proxy
6. **Add to VPS setup** — `npx clawhub install vincent-<name>` in `buildSetupScript()`

No frontend changes needed — the data source appears automatically from the registry on the secret detail page.

## Future Considerations

- **More data sources**: Reddit, GitHub, Google Search, weather APIs, stock data, etc.
- **Per-secret credit pools**: optional isolated budgets per data source secret
- **Auto-recharge**: automatically charge card when balance drops below threshold
- **Usage alerts**: email/Telegram notifications at credit thresholds
- **Caching**: cache frequently-requested data to reduce upstream costs
- **Custom data sources**: let users BYO API keys for data sources they already have accounts with
