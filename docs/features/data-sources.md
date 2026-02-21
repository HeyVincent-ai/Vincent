# Data Sources

Data Sources provides agents with managed access to third-party APIs (Twitter/X, Brave Search) without users needing to sign up for those APIs themselves. Requests flow through Vincent's backend as a proxy — we authenticate, check credits, forward to the upstream API, log usage, and charge accordingly.

## Architecture

```
Agent (with ssk_ key) → Vincent Backend (proxy) → Upstream API (Twitter, Brave)
                            │
                            ├── API key auth (existing middleware)
                            ├── Type check (DATA_SOURCES secret)
                            ├── Claim check (must be claimed)
                            ├── Credit gate (sufficient balance)
                            ├── Rate limiting (60 req/min per key)
                            ├── Forward to upstream API
                            ├── Deduct credits (atomic)
                            └── Log usage
```

## Secret Type: DATA_SOURCES

Modeled as a secret type in the existing secrets system. Unlike `EVM_WALLET` which stores a private key, the `DATA_SOURCES` secret has no actual secret value — it exists to:

- Own the API key(s) for data source access
- Link to a user for billing (via claim flow)
- Appear on the user's accounts page

## Credit System

- **Per-user credit pool** (not per-secret). All `DATA_SOURCES` secrets for a user share one balance.
- **$10 free credits** on first use (`User.dataSourceCreditUsd` field)
- Credits deducted immediately after successful upstream call
- If balance insufficient: 402 Payment Required
- Users add credits via frontend ($5-$500, Stripe off-session charge)
- Atomic deduction via raw SQL (`$executeRaw`) to prevent race conditions

### Pricing

**Twitter / X.com:**

| Endpoint | Cost |
|---|---|
| Search tweets | $0.01 |
| Get tweet by ID | $0.005 |
| Get user profile | $0.005 |
| Get user tweets | $0.01 |

**Brave Search:**

| Endpoint | Cost |
|---|---|
| Web search | $0.005 |
| News search | $0.005 |

## Proxy Endpoints (Agent API)

All use API key auth + data source guard middleware.

### Twitter (`/api/data-sources/twitter/`)

| Method | Path | Upstream |
|---|---|---|
| GET | `/search` | `GET /2/tweets/search/recent` |
| GET | `/tweets/:tweetId` | `GET /2/tweets/:id` |
| GET | `/users/:username` | `GET /2/users/by/username/:username` |
| GET | `/users/:userId/tweets` | `GET /2/users/:id/tweets` |

### Brave Search (`/api/data-sources/brave/`)

| Method | Path | Upstream |
|---|---|---|
| GET | `/web` | `GET /res/v1/web/search` |
| GET | `/news` | `GET /res/v1/news/search` |

Responses include a `_vincent` metadata block with cost charged and remaining credit balance.

## Management Endpoints (Frontend)

Session auth + secret ownership:

| Method | Path | Description |
|---|---|---|
| GET | `/api/secrets/:id/data-sources` | Available data sources + usage stats |
| GET | `/api/secrets/:id/data-sources/credits` | Credit balance + purchases |
| POST | `/api/secrets/:id/data-sources/credits` | Add credits (Stripe charge) |
| GET | `/api/secrets/:id/data-sources/usage` | Usage breakdown by source/period |

## OpenClaw Pre-Provisioning

For Vincent-deployed OpenClaw instances, `DATA_SOURCES` secrets are pre-created and pre-claimed during VPS provisioning. The API key is written to `~/.openclaw/credentials/vincentdata/default.json` on the VPS. The agent is ready to use data sources immediately with zero user setup.

## Data Source Registry

Available sources are defined in code (`src/dataSources/registry.ts`), not in the database:

```typescript
interface DataSourceConfig {
  id: string;            // "twitter", "brave-search"
  displayName: string;
  description: string;
  status: 'active' | 'coming_soon';
  endpoints: Record<string, { description: string; costUsd: number }>;
}
```

## Adding a New Data Source

1. Add config to `src/dataSources/registry.ts`
2. Create handler in `src/dataSources/<name>/handler.ts`
3. Create routes in `src/dataSources/<name>/routes.ts`
4. Register routes in the data sources router
5. Create agent skill in `skills/<name>/SKILL.md`
6. Add to VPS setup script in `openclaw.service.ts`

No frontend changes needed — sources appear automatically from the registry.

## Files

| File | Responsibility |
|---|---|
| `src/dataSources/registry.ts` | Source config (endpoints, pricing) |
| `src/dataSources/middleware.ts` | Guard middleware |
| `src/dataSources/credit.service.ts` | Atomic credit operations |
| `src/dataSources/usage.service.ts` | Usage logging/aggregation |
| `src/dataSources/proxy.ts` | `wrapProxy()` wrapper |
| `src/dataSources/router.ts` | Main router |
| `src/dataSources/twitter/` | Twitter handler + routes |
| `src/dataSources/brave/` | Brave handler + routes |
| `src/api/routes/dataSourceManagement.routes.ts` | Frontend management endpoints |
| `frontend/src/components/DataSourcesView.tsx` | Credits, usage, data source cards |
