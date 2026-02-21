# Backend Overview

The backend is a single Express 5 + TypeScript server in `src/`. It handles authentication, secret management, skill execution, billing, and all API endpoints.

## Entry Point

`src/index.ts` starts the server and background workers:
- Express HTTP server
- Telegram bot (long polling)
- OpenClaw usage pollers (every 5 min for all READY deployments)
- OpenClaw hardening worker (timeouts, cleanup, health checks every 5 min)
- Deployment resume on startup (restarts interrupted provisions)
- Graceful shutdown for all the above

`src/app.ts` configures the Express app:
- CORS, Helmet, rate limiting
- Raw body capture for Stripe webhook verification
- Request logging
- Route mounting
- Global error handler

## How Requests Flow

### Agent requests (skill execution)

```
Request with Authorization: Bearer ssk_...
  → apiKeyAuth middleware
    → Validates API key (SHA-256 hash + DB lookup against non-revoked keys)
    → Loads secret metadata onto req.secret (excludes value!)
    → Loads req.apiKeyId
  → Route handler
    → Loads private key from DB (only when needed)
    → Calls policy checker
    → Executes skill action (or creates pending approval)
    → Creates audit log entry (fire-and-forget)
    → Returns result
```

### User requests (frontend)

```
Request with session token header
  → validateSession middleware
    → Validates Stytch session token
    → Loads/creates user, sets req.user
  → requireSecretOwnership middleware (for secret-specific routes)
    → Verifies req.user owns the secret
  → Route handler
    → Business logic
    → Returns result
```

## Service Layer (`src/services/`)

Business logic separated from route handlers.

| Service | File | Responsibility |
|---|---|---|
| Secret | `secret.service.ts` | CRUD, wallet creation (ZeroDev), claim flow, relink tokens |
| API Key | `apiKey.service.ts` | Generation, SHA-256 hashing, validation, revocation |
| Auth | `auth.service.ts` | Stytch session validation, find-or-create user |
| Policy | `policy.service.ts` | Policy CRUD, Zod config validation per type |
| Price | `price.service.ts` | CoinGecko ETH/token → USD with 5-min cache |
| OpenClaw | `openclaw.service.ts` | VPS lifecycle orchestration (OVH + OpenRouter + SSH) |
| OVH | `ovh.service.ts` | OVH VPS API client |
| OpenRouter | `openrouter.service.ts` | Per-deployment API key provisioning |
| Ownership | `ownership.service.ts` | Wallet ownership challenge/verify/transfer |

## Skills Layer (`src/skills/`)

Execution logic for each skill type. These are the functions that actually interact with blockchains and external APIs.

| Service | File | What it does |
|---|---|---|
| EVM Wallet | `evmWallet.service.ts` | High-level: transfer, sendTx, swap, balance, with policy integration |
| ZeroDev | `zerodev.service.ts` | Smart account creation, transaction execution, recovery, session keys |
| Polymarket | `polymarket.service.ts` | Low-level CLOB API client (orders, positions, markets) |
| Polymarket Skill | `polymarketSkill.service.ts` | High-level with policy integration and approval flow |
| 0x Swap | `zeroEx.service.ts` | 0x Swap API v2 (price quotes, swap execution) |
| Alchemy | `alchemy.service.ts` | Portfolio API for multi-chain token balances |
| Raw Signer | `rawSigner.service.ts` | Ethereum + Solana raw message/transaction signing |
| Gas | `gas.service.ts` | Gas usage recording, subscription checks |

## Middleware Stack

Applied in order by `src/app.ts`:

1. CORS
2. Helmet (security headers)
3. Rate limiting (100 req/min global)
4. Raw body capture (for Stripe webhooks)
5. JSON body parsing
6. Request logging
7. Routes (with per-route middleware: auth, ownership, validation)
8. Global error handler

## Key Patterns

**`AppError` class** — custom error with code, message, status. Thrown anywhere, caught by global error handler. In production, internal details are masked.

**`asyncHandler` wrapper** — wraps async route handlers to catch rejected promises and forward to error handler.

**`sendSuccess` / `sendError`** — standardized response format: `{ success: true, data: {...} }` or `{ success: false, error: { code, message } }`.

**Fire-and-forget audit logging** — `audit.log({...})` is called without `await`. Errors are caught and logged to console, never blocking the main request.

**`toPublicData()` pattern** — every model that could contain sensitive data has a `toPublicData()` function that strips private fields before returning to clients.

## Environment Variables

All validated at startup via Zod in `src/utils/env.ts`. The server fails fast if required vars are missing. Optional vars (like `ALCHEMY_API_KEY`) gracefully degrade features when absent.

See the `.env.example` file for the full list.
