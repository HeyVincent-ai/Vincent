# Architecture

## System Overview

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│   AI Agent      │────▶│   Vincent API         │────▶│   PostgreSQL    │
│                 │     │   (Express backend)   │     │   (Prisma ORM)  │
└─────────────────┘     └────────┬─────────────┘     └─────────────────┘
                                 │
            ┌────────────────────┼────────────────────────┐
            ▼                    ▼                        ▼
   ┌───────────────┐   ┌─────────────────┐     ┌─────────────────┐
   │ Telegram Bot  │   │  Frontend App   │     │  Skill Executors │
   │ (Approvals)   │   │  (React SPA)    │     │  ZeroDev, 0x,   │
   └───────────────┘   └─────────────────┘     │  Polymarket,    │
                                                │  Twitter, Brave │
                                                └─────────────────┘
```

## Request Flow

All agent requests follow the same pattern:

1. Agent sends request with `Authorization: Bearer ssk_...` header
2. `apiKeyAuth` middleware validates the API key, loads secret metadata onto `req.secret`
3. Route handler extracts the secret's private key from DB (only when needed for execution)
4. Policy checker evaluates all policies for the secret
5. Based on verdict: execute immediately, send for Telegram approval, or deny
6. Audit log entry created (fire-and-forget)
7. Response returned to agent

## Component Boundaries

### Backend (`src/`)

The backend is a single Express server that handles everything:

- **API layer** (`src/api/`) — routes, middleware, request validation
- **Services** (`src/services/`) — business logic (secrets, auth, policies, billing, OpenClaw orchestration)
- **Skills** (`src/skills/`) — blockchain/trading execution (ZeroDev, Polymarket, 0x, Alchemy)
- **Data Sources** (`src/dataSources/`) — proxy layer for Twitter and Brave Search APIs
- **Telegram** (`src/telegram/`) — bot for human approvals
- **Billing** (`src/billing/`) — Stripe integration and gas aggregation
- **Audit** (`src/audit/`) — append-only audit logging

See [Backend Overview](./backend/README.md) for details.

### Frontend (`frontend/`)

React SPA served by the same Express server in production (Vite build output). Communicates with backend via REST API. See [Frontend Overview](./frontend/README.md).

### Trade Manager (`src/services/tradeManager/`)

Integrated into the Vincent backend as a service. Manages automated trading rules (stop-loss, take-profit, trailing stop) for Polymarket positions. Multi-tenant via `secretId` scoping, uses the same PostgreSQL database, and executes trades through `polymarketSkill.placeBet()` with full policy enforcement. API endpoints are nested under `/api/skills/polymarket/rules/...`. See [Trade Manager](./features/trade-manager.md).

The `trade-manager/` directory contains the original standalone implementation (historical reference).

### Skill CI (`skill-ci/`)

Test harness that uses an LLM agent to verify skills work against a live backend. Separate `package.json` with Vercel AI SDK deps. See [Testing Overview](./testing/README.md).

### Skill Definitions (`skills/`)

Markdown files (`SKILL.md`) that agents read to learn how to use each skill. These are the "instruction manuals" for AI agents — they contain endpoint docs, example requests, and usage flows.

## External Service Dependencies

| Service | Purpose | Used by |
|---|---|---|
| Stytch | User authentication (magic links, OAuth) | Backend auth |
| ZeroDev | Smart accounts, gas sponsorship, ownership transfer | EVM Wallet skill |
| Stripe | Subscriptions, gas billing, credit purchases | Billing |
| Telegram | Human approval bot | Approval flow |
| CoinGecko | ETH/token → USD price conversion | Policy spending limits |
| Alchemy | Portfolio balances across chains | Balance display |
| 0x Swap API | Token swap execution | Swap skill |
| Polymarket CLOB | Prediction market trading | Polymarket skill |
| Twitter/X API | Tweet search and retrieval | Data source proxy |
| Brave Search API | Web and news search | Data source proxy |
| OVH | VPS provisioning for OpenClaw | OpenClaw deploy |
| OpenRouter | LLM API keys for OpenClaw instances | OpenClaw deploy |
| Railway | Hosting (backend + DB + frontend) | Deployment |

## Authentication Model

Two auth paths coexist:

1. **Session auth** (frontend/users) — Stytch session tokens validated via `validateSession` middleware. Used for dashboard, secret management, billing.

2. **API key auth** (agents) — `ssk_`-prefixed bearer tokens validated via `apiKeyAuth` middleware. Each key is scoped to one secret. Used for all skill execution endpoints.

Some endpoints accept either (e.g., `GET /api/secrets/info`).

See [Authentication](./backend/auth.md) for full details.

## Data Flow: Secret Lifecycle

```
Agent creates secret          User claims via URL         Agent uses skill
─────────────────────         ───────────────────         ─────────────────
POST /api/secrets             POST /api/secrets/:id/claim POST /api/skills/...
  │                             │                           │
  ├─ Generate private key       ├─ Validate claim token     ├─ Validate API key
  ├─ Create ZeroDev account     ├─ Associate with user      ├─ Load secret + policies
  ├─ Store in PostgreSQL        ├─ User can now add         ├─ Check policies
  ├─ Generate API key             │  policies, view          │  (allow/deny/approve)
  ├─ Generate claim token         │  balances, etc.         ├─ Execute action
  └─ Return API key + claim URL                             ├─ Log audit entry
                                                            └─ Return result
```
