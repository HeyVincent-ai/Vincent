# Vincent Documentation

Vincent is a secure secret management service for AI agents. It stores secrets (private keys, API credentials) on behalf of users and executes actions using those secrets when requested by authorized agents — the agent never sees the actual secret value. Policies control what actions are allowed, and humans can approve when needed via Telegram.

## Quick Orientation

| What you need | Where to look |
|---|---|
| How the system fits together | [Architecture](./architecture.md) |
| Where files live in the repo | [Directory Map](./directory-map.md) |
| Database models and schema | [Database](./database.md) |
| Security model | [Security](./security.md) |

## Major Components

### Backend (`src/`)

The Express/TypeScript API server — handles auth, secrets, skills, policies, billing, and more.

- [Backend Overview](./backend/README.md) — service layer, middleware, how requests flow
- [API Routes Reference](./backend/api-routes.md) — every endpoint, grouped by domain
- [Authentication](./backend/auth.md) — Stytch sessions, API keys, middleware chain
- [Policy Engine](./backend/policies.md) — how policies gate secret usage
- [Billing](./backend/billing.md) — Stripe subscriptions, gas tracking, credit systems
- [Telegram Bot](./backend/telegram.md) — human approval flow

### Features / Skills

Each skill is a capability tied to a secret type. These docs cover how each feature works end-to-end (backend + frontend + agent integration).

- [EVM Wallet](./features/evm-wallet.md) — ZeroDev smart accounts, transfers, swaps, balances
- [Polymarket](./features/polymarket.md) — CLOB trading, bet placement, position management
- [Self-Custody](./features/self-custody.md) — wallet ownership transfer to user's EOA
- [Data Sources](./features/data-sources.md) — Twitter/Brave Search proxy with credit billing
- [OpenClaw Deploy](./features/openclaw.md) — 1-click VPS deployment with embedded web UI
- [Trade Manager](./features/trade-manager.md) — automated stop-loss, take-profit, and trailing stops for Polymarket

### Frontend (`frontend/`)

- [Frontend Overview](./frontend/README.md) — React app structure, pages, components

### Testing

- [Testing Overview](./testing/README.md) — unit tests, e2e tests, skill CI agent harness

## Tech Stack

| Component | Technology |
|---|---|
| Runtime | Node.js 20+ (22 in CI), ES2022 modules |
| Language | TypeScript (strict mode, `NodeNext` module resolution) |
| Framework | Express 5 |
| Database | PostgreSQL via Prisma ORM |
| Auth | Stytch (magic links, OAuth) |
| Smart Accounts | ZeroDev SDK v5 (Kernel v3.1, EntryPoint v0.7) |
| Payments | Stripe |
| Approval Bot | Telegram via grammy |
| Frontend | React + TypeScript + Vite + Tailwind CSS v4 |
| Testing | Vitest |
| Hosting | Railway |

## Core Concepts

**Secrets** — stored values (private keys, credentials) that agents use but never see. Each secret has a type (`EVM_WALLET`, `DATA_SOURCES`, etc.) and is "claimable" — created by an agent, claimed by a user via URL.

**Skills** — capabilities tied to secret types. The EVM Wallet skill can transfer tokens; the Polymarket skill can place bets. Skills are documented in `skills/*/SKILL.md` files that agents read directly.

**Policies** — rules governing secret usage. Allowlists, spending limits, approval requirements. Default-open: if no policies exist, actions are allowed.

**API Keys** — agents authenticate with `ssk_`-prefixed keys scoped to a specific secret. Keys are bcrypt-hashed in the DB, shown only once on creation.

## Key Flows

**Agent onboarding:** Agent calls `POST /api/secrets` → gets API key + claim URL + wallet address → starts using the wallet immediately. Owner claims later, adds policies.

**Action execution:** Agent requests action with API key → backend validates key → checks policies → executes or requests human approval → returns result.

**Human approval:** Policy requires approval → Telegram bot sends inline keyboard → user approves/denies → action executes or fails.
