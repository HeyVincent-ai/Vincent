# Data Sources - Product Plan

## Overview

Data Sources is a feature that provides OpenClaw users with pre-configured access to third-party APIs (Twitter/X, Brave Search, etc.) without requiring them to sign up for, configure, or manage those API keys themselves. Requests flow through our backend as a proxy — we authenticate the user, check their credit balance, forward the request to the upstream API using our API key, log usage, and charge accordingly.

This is a **reusable pattern** designed so new data sources can be added with minimal effort: define pricing, write a proxy handler, and publish a clawhub skill.

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
│  Runs clawhub    │     │  - Auth (deploy token)│     └────────────────┘
│  skill that      │     │  - Credit check       │
│  calls our proxy │     │  - Usage logging      │
└──────────────────┘     │  - Rate limiting      │
                         │  - Request forwarding │
       ┌─────────┐       └──────────┬────────────┘
       │Frontend │                  │
       │Data     │◀─────────────────┘
       │Sources  │  Usage/credit data
       │Page     │
       └─────────┘
```

### Request Flow

1. Agent (on OpenClaw VPS) invokes a data source skill function (e.g., "search tweets about Bitcoin")
2. The clawhub skill makes an HTTPS request to `https://heyvincent.ai/api/data-sources/twitter/search`
3. Request includes the deployment's `accessToken` as Bearer auth
4. Backend validates token → finds deployment → finds user
5. Backend checks user's data source credit balance
6. If sufficient credit: forwards request to upstream API (Twitter, Brave, etc.)
7. Logs usage in `DataSourceUsage` table, deducts cost from user's credit balance
8. Returns upstream response to the skill → agent

### Authentication

Data source proxy endpoints authenticate via the **OpenClaw deployment access token**. This token is already available on every OpenClaw VPS (generated during provisioning) and uniquely identifies a deployment and its owning user.

```
Authorization: Bearer <deployment-access-token>
```

The middleware:
1. Extracts Bearer token from Authorization header
2. Looks up `OpenClawDeployment` where `accessToken = token` and `status IN ('READY', 'CANCELING')`
3. Resolves `userId` from the deployment
4. Attaches `user` and `deployment` to the request context

## Credit System

### Initial Credits
- Every user gets **$10.00 of free data source credit** upon first use (or account creation)
- Credit is tracked as a field on the `User` model: `dataSourceCreditUsd`

### Credit Balance
- Credit is **per-user** (not per-deployment), since a user may have multiple agents
- All deployments for a user draw from the same credit pool
- Usage is tracked per-deployment for visibility/attribution

### Charging
- Each API call has a fixed cost (defined per data source, per endpoint type)
- Cost is deducted from `dataSourceCreditUsd` immediately after successful upstream call
- If credit balance would go negative, the request is **rejected** with a 402 Payment Required error and a message directing them to add credits

### Adding Credits
- Users add credits via the Data Sources frontend page
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

### New Fields on `User`

```prisma
model User {
  // ... existing fields ...
  dataSourceCreditUsd  Decimal  @default(10.00) @db.Decimal(10, 2)
}
```

### New Models

```prisma
model DataSourceUsage {
  id             String    @id @default(uuid())
  userId         String
  deploymentId   String?   // nullable for future non-OpenClaw usage
  dataSource     String    // "twitter", "brave-search"
  endpoint       String    // "search", "get-tweet", "web-search", etc.
  costUsd        Decimal   @db.Decimal(10, 6)
  requestMetadata Json?    // optional: query params, result count, etc.
  createdAt      DateTime  @default(now())

  user           User                @relation(fields: [userId], references: [id])
  deployment     OpenClawDeployment? @relation(fields: [deploymentId], references: [id])

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

Rather than a database table, available data sources are defined in code as a typed config. This keeps things simple and avoids needing admin UI to manage data sources. We can move to DB-driven later if needed.

```typescript
interface DataSourceConfig {
  id: string;            // "twitter", "brave-search"
  displayName: string;   // "Twitter / X.com"
  description: string;
  iconUrl?: string;
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

### Data Source Proxy Endpoints

All proxy endpoints are under `/api/data-sources/:dataSource/` and use deployment token auth.

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

These are for the frontend Data Sources page:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/data-sources` | List available data sources with user's usage stats |
| GET | `/api/data-sources/credits` | Get user's credit balance and recent purchases |
| POST | `/api/data-sources/credits` | Add credits (Stripe off-session charge) |
| GET | `/api/data-sources/usage` | Get usage breakdown (by data source, by time period) |
| GET | `/api/data-sources/usage/history` | Monthly usage history |

### Rate Limiting

Each data source proxy endpoint has per-deployment rate limiting to prevent abuse:
- Twitter: 60 requests/minute per deployment
- Brave Search: 60 requests/minute per deployment

Rate limiting is on top of credit balance checks.

## Data Source Implementations

### Twitter / X.com

**Upstream API:** X API v2 (https://api.twitter.com/2/)

**Our API key:** We maintain a single X API Pro (or Basic) developer account. All user requests are proxied through our key.

**Proxy handler pattern:**
```typescript
// src/dataSources/twitter.handler.ts
export async function searchTweets(query: string, options: TwitterSearchOptions) {
  const response = await fetch('https://api.twitter.com/2/tweets/search/recent', {
    headers: { 'Authorization': `Bearer ${env.TWITTER_BEARER_TOKEN}` },
    // ... query params from user request
  });
  return response.json();
}
```

**What we expose to the agent:**
- Search tweets by query (with filters: date range, language, etc.)
- Get specific tweet details (text, author, metrics)
- Get user profile (bio, follower count, etc.)
- Get user's recent tweets

**What we strip/transform:**
- Remove fields that aren't useful to agents (internal IDs, etc.)
- Normalize response format across data sources where possible
- Add our own metadata (cost charged, remaining credits)

### Brave Search

**Upstream API:** Brave Search API (https://api.search.brave.com/)

**Our API key:** We maintain a Brave Search API subscription. All user requests are proxied through our key.

**What we expose to the agent:**
- Web search with query, count, offset, freshness filters
- News search with similar parameters

## OpenClaw Integration

### Skill Packages

Each data source gets a clawhub skill package that agents on OpenClaw instances can use. These are thin wrappers that:
1. Read the deployment's access token from the OpenClaw environment
2. Make HTTP requests to our proxy endpoints
3. Return parsed results to the agent

**Skill installation** happens during VPS provisioning in `buildSetupScript()`:
```bash
npx --yes clawhub@latest install vincent-twitter || true
npx --yes clawhub@latest install vincent-brave-search || true
```

**Skill configuration** happens via environment or config file on the VPS. The access token is already available at `/root/.openclaw-setup-token`.

### Skill Communication

Skills communicate with `https://heyvincent.ai/api/data-sources/` using HTTPS with Bearer token authentication. This is the same pattern used by the existing agentwallet and vincentpolymarket skills.

## Frontend

### Data Sources Page (`/data-sources`)

New page accessible from the sidebar navigation.

**Layout:**

```
┌─────────────────────────────────────────────────────────────┐
│  Data Sources                                                │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Credit Balance: $8.45              [Add Credits]      │  │
│  │  Free tier: $10.00 included                            │  │
│  │  ████████████████░░░░  84.5% remaining                 │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  Available Data Sources                                      │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  🐦 Twitter / X.com                        Active      │  │
│  │  Search tweets, get user profiles, read timelines      │  │
│  │  Pricing: $0.005 - $0.01 per request                   │  │
│  │  This month: 42 requests · $0.38 spent                 │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  🔍 Brave Search                            Active      │  │
│  │  Web search, news search                               │  │
│  │  Pricing: $0.005 per request                           │  │
│  │  This month: 128 requests · $0.64 spent                │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  Usage History                                               │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Feb 2026:  170 requests  ·  $1.02 spent               │  │
│  │  Jan 2026:  523 requests  ·  $4.15 spent               │  │
│  └────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Add Credits Modal

Same pattern as OpenClaw credit addition:
- Input amount ($5 - $500)
- Stripe off-session charge
- 3D Secure handling if required
- Balance updates immediately

## Adding New Data Sources (Future Pattern)

To add a new data source:

1. **Define config** in `src/dataSources/registry.ts` — add entry with id, name, endpoints, pricing
2. **Create handler** in `src/dataSources/<name>.handler.ts` — implement proxy functions for each endpoint
3. **Create routes** in `src/dataSources/<name>.routes.ts` — Express routes that call the handler
4. **Register routes** in the data sources router
5. **Create clawhub skill** — thin wrapper that calls our proxy
6. **Add to VPS setup** — add `npx clawhub install vincent-<name>` to `buildSetupScript()`
7. **Update frontend** — data source appears automatically from registry (no frontend changes needed)

Steps 1-4 are backend-only. Step 5-6 are packaging/deployment. Step 7 is automatic.

## Environment Variables

New env vars required:
```
TWITTER_BEARER_TOKEN=        # X API v2 Bearer token
BRAVE_SEARCH_API_KEY=        # Brave Search API key
```

Both optional — if not configured, the respective data source returns 503 Service Unavailable.

## Security Considerations

1. **Upstream API keys** are never exposed to agents — they only exist on our backend
2. **Deployment tokens** are scoped — one deployment's token cannot access another deployment's data
3. **Credit checks** happen before upstream calls — no risk of unbounded charges
4. **Rate limiting** prevents abuse even within credit limits
5. **Request logging** provides full audit trail of all data source usage
6. **Input validation** on all proxy endpoints — we validate and sanitize before forwarding to upstream APIs

## Future Considerations

- **More data sources**: Reddit, GitHub, Google Search, weather APIs, stock data, etc.
- **Per-deployment credit pools**: optional isolation of credit budgets per agent
- **Auto-recharge**: automatically charge card when balance drops below threshold
- **Usage alerts**: email/Telegram notifications at credit thresholds
- **Standalone agent access**: allow non-OpenClaw agents to use data sources via dedicated API key
- **Caching**: cache frequently-requested data to reduce upstream costs and improve latency
- **Custom data sources**: let users bring their own API keys for data sources they already have accounts with
