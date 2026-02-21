# Vincent

A secure secret management service designed specifically for AI agents. Vincent stores secrets on behalf of users and executes actions using those secrets when requested by authorized agents—the agent never sees the actual secret value.

**🔗 Try it live: [heyvincent.ai](https://heyvincent.ai)**

## Problem

AI agents increasingly need to perform sensitive operations that require secrets (wallet keys, API keys, credentials). Current approaches either:

1. **Give agents direct access to secrets** — risky, agents could leak or misuse them
2. **Require manual approval for every action** — slow, poor UX

Vincent provides a middle ground: agents can request actions that use secrets, but policies control what actions are allowed, and humans can approve when needed.

## Features

- **Secure Secret Storage** — Secrets stored in PostgreSQL (encrypted at rest), never exposed to agents
- **Smart Wallet Skill** — EVM wallet operations via ZeroDev smart accounts with gas sponsorship
- **Polymarket Skill** — Place prediction market bets with policy controls
- **Token Swaps** — Swap tokens via 0x aggregator with spending limits
- **Policy Engine** — Spending limits, address allowlists, token allowlists, and more
- **Human Approval** — Telegram bot for approving sensitive transactions
- **Audit Logging** — Complete transaction history with input/output data
- **Billing Integration** — Stripe subscriptions for mainnet gas sponsorship

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   AI Agent      │────▶│  Vincent API ──▶│   PostgreSQL          │
│                 │     │   (Backend)     │     │   (Secrets DB)  │
└─────────────────┘     └────────┬────────┘     └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │  Skill Executor │
                       │  (ZeroDev/0x)   │
                       └─────────────────┘
                                │
       ┌────────────────────────┼────────────────────────┐
       ▼                        ▼                        ▼
┌───────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ Telegram Bot  │     │  Frontend App   │     │  Blockchain     │
│ (Approvals)   │     │  (User Portal)  │     │  (EVM Chains)   │
└───────────────┘     └─────────────────┘     └─────────────────┘
```

## Core Concepts

### Secrets

Secrets are stored encrypted and never exposed to agents. Each secret has:

- A **type** (e.g., `EVM_WALLET`)
- A **memo** for user notes
- A **claim token** for ownership transfer

### Skills

Skills are capabilities tied to secret types. Current skills:

- **EVM Wallet** — Transfer ETH/ERC20, send transactions, swap tokens
- **Polymarket** — Place bets, check positions, browse markets

### Policies

Policies govern how secrets can be used:

| Policy                  | Description                           |
| ----------------------- | ------------------------------------- |
| `ADDRESS_ALLOWLIST`     | Only interact with approved addresses |
| `FUNCTION_ALLOWLIST`    | Only call approved contract functions |
| `TOKEN_ALLOWLIST`       | Only transfer approved tokens         |
| `SPENDING_LIMIT_PER_TX` | Max USD value per transaction         |
| `SPENDING_LIMIT_DAILY`  | Max USD value per 24 hours            |
| `SPENDING_LIMIT_WEEKLY` | Max USD value per 7 days              |
| `REQUIRE_APPROVAL`      | Always require human approval         |
| `APPROVAL_THRESHOLD`    | Require approval above USD amount     |

### API Keys

Each secret can have multiple API keys for agent access. Keys are bcrypt-hashed and prefixed with `ssk_`.

## Tech Stack

| Component          | Technology                                  |
| ------------------ | ------------------------------------------- |
| Backend            | Node.js + TypeScript + Express 5            |
| Database           | PostgreSQL + Prisma                         |
| Authentication     | Stytch                                      |
| Smart Accounts     | ZeroDev (Kernel v3.1, EntryPoint v0.7)      |
| DEX Aggregator     | 0x Swap API v2                              |
| Prediction Markets | Polymarket CLOB API                         |
| Token Balances     | Alchemy Portfolio API                       |
| Payments           | Stripe                                      |
| Approval Bot       | Telegram (grammy)                           |
| Frontend           | React + TypeScript + Vite + Tailwind CSS v4 |

## Getting Started

### Prerequisites

- Node.js >= 20.0.0
- PostgreSQL database
- Account credentials for external services (see Environment Variables)

### Installation

```bash
# Install backend dependencies
npm install

# Install frontend dependencies
npm --prefix frontend install

# Generate Prisma client
npm run db:generate

# Run database migrations
npm run db:migrate
```

### Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Server
NODE_ENV=development
PORT=3000

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/Vincent

# Stytch Authentication
STYTCH_PROJECT_ID=
STYTCH_SECRET=
STYTCH_ENV=test

# ZeroDev Smart Accounts
ZERODEV_PROJECT_ID=
ZERODEV_API_KEY=

# Stripe Billing
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_ID=
STRIPE_OPENCLAW_PRICE_ID=
STRIPE_CREDIT_PRICE_ID=
STRIPE_CREDIT_PRICE_LOOKUP_KEY=

# Telegram Bot
TELEGRAM_BOT_TOKEN=

# Price Oracle
COINGECKO_API_KEY=

# Token Balances
ALCHEMY_API_KEY=

# 0x DEX Aggregator
ZEROX_API_KEY=
```

### Running

```bash
# Development (backend + frontend)
npm run dev:all

# Backend only
npm run dev

# Frontend only
npm run dev:frontend

# Production build
npm run build
npm start
```

## API Overview

### Secret Management

| Endpoint                      | Description                                 |
| ----------------------------- | ------------------------------------------- |
| `POST /api/secrets`           | Create secret (returns API key + claim URL) |
| `GET /api/secrets/info`       | Get secret metadata via API key             |
| `POST /api/secrets/:id/claim` | Claim a secret (requires auth)              |
| `POST /api/secrets/relink`    | Exchange relink token for new API key       |

### EVM Wallet Skill

| Endpoint                                       | Description                          |
| ---------------------------------------------- | ------------------------------------ |
| `POST /api/skills/evm-wallet/transfer`         | Transfer ETH or ERC20                |
| `POST /api/skills/evm-wallet/send-transaction` | Execute arbitrary transaction        |
| `POST /api/skills/evm-wallet/swap/preview`     | Preview token swap                   |
| `POST /api/skills/evm-wallet/swap/execute`     | Execute token swap                   |
| `GET /api/skills/evm-wallet/balance`           | Get ETH/ERC20 balance                |
| `GET /api/skills/evm-wallet/balances`          | Get portfolio balances (multi-chain) |
| `GET /api/skills/evm-wallet/address`           | Get smart account address            |

### Polymarket Skill

| Endpoint                                   | Description        |
| ------------------------------------------ | ------------------ |
| `POST /api/skills/polymarket/bet`          | Place a bet        |
| `GET /api/skills/polymarket/positions`     | Get open positions |
| `GET /api/skills/polymarket/markets`       | Search markets     |
| `GET /api/skills/polymarket/balance`       | Get USDC balance   |
| `DELETE /api/skills/polymarket/orders/:id` | Cancel order       |

### Policy Management

| Endpoint                                     | Description   |
| -------------------------------------------- | ------------- |
| `GET /api/secrets/:id/policies`              | List policies |
| `POST /api/secrets/:id/policies`             | Create policy |
| `DELETE /api/secrets/:id/policies/:policyId` | Delete policy |

### Billing

| Endpoint                        | Description                    |
| ------------------------------- | ------------------------------ |
| `GET /api/billing/subscription` | Get subscription status        |
| `POST /api/billing/subscribe`   | Create Stripe checkout session |
| `GET /api/billing/usage`        | Get current month gas usage    |

## User Flows

### 1. Agent Creates Wallet

1. Agent calls `POST /api/secrets` with `type: "EVM_WALLET"`
2. API generates EOA private key, creates ZeroDev smart account
3. Returns API key, claim URL, and smart account address
4. Agent immediately starts using the wallet via API
5. Owner later claims via URL, adds policies

### 2. Agent Executes Transaction

1. Agent calls skill endpoint with API key
2. Backend validates API key and checks policies
3. If allowed → execute immediately
4. If requires approval → send Telegram notification
5. If denied → return error
6. Return result to agent

### 3. Human Approval via Telegram

1. User configures Telegram in the frontend
2. User starts conversation with Vincent bot
3. When approval needed, bot sends message with action details
4. User taps Approve or Deny
5. Action executes or fails accordingly

## Billing Model

- **Free tier**: Testnets only, unlimited usage
- **Pro tier**: $10/month subscription + mainnet gas costs

Gas is sponsored via ZeroDev paymaster. Mainnet gas costs are passed through at cost.

## Development

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Lint code
npm run lint

# Format code
npm run format

# Open Prisma Studio
npm run db:studio
```

## Project Structure

```
/src
  /api          # Express routes and middleware
  /services     # Business logic (secrets, auth, policies)
  /skills       # Skill implementations (EVM wallet, Polymarket)
  /policies     # Policy checking engine
  /db           # Prisma client
  /types        # TypeScript types
  /utils        # Helpers (env, response formatting)
  /telegram     # Telegram bot for approvals
  /audit        # Audit logging service
  /billing      # Stripe integration & gas tracking
/prisma         # Schema & migrations
/frontend       # React application
/skills         # Skill documentation for agents
```

## Security

- **Database Encryption**: PostgreSQL encrypted at rest
- **API Key Hashing**: Keys hashed with bcrypt, shown once on creation
- **Rate Limiting**: Configurable rate limits on all endpoints
- **Audit Logging**: All actions logged with full inputs/outputs
- **Claim Token Security**: One-time use, expire after 7 days
- **Secret Isolation**: Agents never see raw secret values

## Publishing Instructions

### Deploying to Production

Pushing to `main` will automatically deploy to Railway at [heyvincent.ai](https://heyvincent.ai).

### Publishing the Skill

To publish the Agent Wallet skill to Clawhub:

```bash
./scripts/publish_skill.sh
```

This script will:

1. Bump the patch version in `package.json`
2. Copy `skills/wallet/SKILL.md` to `frontend/public/SKILL.md`
3. Copy `skills/wallet/SKILL.md` to `../agent-skills/skills/wallet/SKILL.md`
4. Publish to Clawhub with the new version

## License

ISC
