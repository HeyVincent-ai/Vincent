# Directory Map

Where everything lives in the repo. Use this to orient yourself when looking for specific code.

## Top Level

```
SafeSkills-2/
├── src/                    # Backend source (Express + TypeScript)
├── frontend/               # React frontend (Vite + Tailwind)
├── trade-manager/          # Original standalone trade manager (historical; now integrated into backend)
├── skill-ci/               # LLM agent test harness for skills
├── skills/                 # Agent-facing skill documentation (SKILL.md files)
├── plans/                  # Implementation plans (historical reference)
├── prisma/                 # Database schema and migrations
├── docs/                   # This documentation
├── CLAUDE.md               # AI coding assistant instructions
├── package.json            # Root package.json
├── tsconfig.json           # TypeScript config
└── .github/                # CI workflows
```

## Backend (`src/`)

```
src/
├── index.ts                    # Server entry point, graceful shutdown, background workers
├── app.ts                      # Express app configuration, middleware stack
│
├── api/
│   ├── routes/
│   │   ├── index.ts            # Route aggregation (mounts all sub-routers)
│   │   ├── auth.routes.ts      # POST /api/auth/session (Stytch session sync)
│   │   ├── user.routes.ts      # GET/PUT /api/user/* (profile, telegram)
│   │   ├── secrets.routes.ts   # CRUD for secrets + claim + relink
│   │   ├── apiKeys.routes.ts   # API key management
│   │   ├── policies.routes.ts  # Policy CRUD
│   │   ├── evmWallet.routes.ts # EVM wallet skill endpoints
│   │   ├── polymarket.routes.ts # Polymarket skill endpoints
│   │   ├── tradeRules.routes.ts # Trade manager rule endpoints (sub-router of polymarket)
│   │   ├── rawSigner.routes.ts # Raw signer endpoints
│   │   ├── billing.routes.ts   # Stripe subscriptions, usage, webhooks
│   │   ├── openclaw.routes.ts  # OpenClaw deployment management
│   │   ├── ownership.routes.ts # Wallet ownership transfer
│   │   ├── auditLogs.routes.ts # Audit log queries + export
│   │   ├── dataSourceManagement.routes.ts # Data source credits/usage
│   │   └── admin.routes.ts     # Admin endpoints
│   └── middleware/
│       ├── errorHandler.ts     # Global error handler + AppError class
│       ├── requestLogger.ts    # Request logging
│       ├── sessionAuth.ts      # Stytch session validation + secret ownership
│       └── apiKeyAuth.ts       # API key validation for agent endpoints
│
├── services/
│   ├── secret.service.ts       # Secret CRUD, claim flow, wallet creation
│   ├── apiKey.service.ts       # API key generation, validation, revocation
│   ├── auth.service.ts         # Stytch integration, find-or-create user
│   ├── policy.service.ts       # Policy CRUD, config validation (Zod schemas)
│   ├── price.service.ts        # CoinGecko price oracle with 5-min cache
│   ├── openclaw.service.ts     # OpenClaw VPS orchestration (OVH + OpenRouter + SSH)
│   ├── ovh.service.ts          # OVH VPS API client
│   ├── openrouter.service.ts   # OpenRouter key provisioning
│   ├── ownership.service.ts    # Wallet ownership transfer (challenge/verify)
│   ├── referral.service.ts     # Referral system
│   ├── email.service.ts        # Email service
│   └── tradeManager/           # Trade manager (rules, monitoring, execution)
│
├── skills/
│   ├── evmWallet.service.ts    # High-level EVM wallet: transfer, sendTx, swap, balance
│   ├── zerodev.service.ts      # ZeroDev smart account creation + transaction execution
│   ├── polymarket.service.ts   # Low-level Polymarket CLOB client
│   ├── polymarketSkill.service.ts # High-level Polymarket with policy integration
│   ├── zeroEx.service.ts       # 0x Swap API v2 client
│   ├── alchemy.service.ts      # Alchemy Portfolio API (multi-chain balances)
│   ├── rawSigner.service.ts    # Raw signing (Ethereum + Solana)
│   ├── gas.service.ts          # Gas usage tracking
│   └── abiDecoder.service.ts   # ABI decoding utilities
│
├── policies/
│   ├── checker.ts              # Policy evaluation engine (8 checker types)
│   └── index.ts                # Exports
│
├── dataSources/
│   ├── registry.ts             # Data source config (endpoints, pricing)
│   ├── middleware.ts            # Guard: type check, claim check, credit gate
│   ├── credit.service.ts       # Atomic credit check/deduct/add
│   ├── usage.service.ts        # Usage logging and aggregation
│   ├── proxy.ts                # wrapProxy() — credit + audit + forwarding
│   ├── router.ts               # Main router (API key auth + guard + rate limit)
│   ├── twitter/                # Twitter/X API v2 proxy
│   │   ├── handler.ts
│   │   └── routes.ts
│   └── brave/                  # Brave Search API proxy
│       ├── handler.ts
│       └── routes.ts
│
├── telegram/
│   ├── bot.ts                  # Bot init, commands, callback handling
│   ├── approvalExecutor.ts     # Executes approved transactions
│   ├── timeoutChecker.ts       # Expires timed-out pending approvals
│   └── index.ts
│
├── billing/
│   ├── stripe.service.ts       # Stripe customer, checkout, subscriptions, webhooks
│   ├── gasAggregation.service.ts # Monthly gas cost aggregation
│   └── index.ts
│
├── audit/
│   ├── audit.service.ts        # Fire-and-forget logging, query, export
│   └── index.ts
│
├── db/
│   └── client.ts               # Prisma client singleton
│
├── config/                     # Configuration
├── utils/
│   ├── env.ts                  # Environment variable validation (Zod)
│   └── response.ts             # sendSuccess/sendError API response helpers
│
├── observability/              # Sentry integration
├── docs/                       # API documentation (OpenAPI)
└── e2e/                        # End-to-end tests (*.e2e.test.ts)
```

## Frontend (`frontend/`)

```
frontend/
├── src/
│   ├── App.tsx                 # Main app with routing
│   ├── main.tsx                # Entry (StytchProvider, WagmiProvider, etc.)
│   ├── api.ts                  # Axios API client with all endpoint functions
│   ├── auth.tsx                # Auth context provider + useAuth hook
│   ├── wagmi.ts                # Wagmi config (RainbowKit wallet connection)
│   │
│   ├── pages/
│   │   ├── Dashboard.tsx       # Secret list + OpenClaw section
│   │   ├── SecretDetail.tsx    # Secret detail (policies, keys, balances, audit)
│   │   ├── Login.tsx           # Stytch UI SDK login
│   │   ├── AuthCallback.tsx    # Auth callback handler
│   │   ├── Claim.tsx           # Secret claim flow
│   │   ├── OpenClawDetail.tsx  # OpenClaw instance management (iframe)
│   │   ├── Account.tsx         # Account settings
│   │   ├── Billing.tsx         # Subscription + usage management
│   │   ├── Landing.tsx         # Landing page
│   │   └── [marketing pages]   # Features, Skills, Security, Terms, Agents
│   │
│   ├── components/
│   │   ├── PolicyManager.tsx   # Policy CRUD UI
│   │   ├── ApiKeyManager.tsx   # API key management UI
│   │   ├── AuditLogViewer.tsx  # Filterable audit log with export
│   │   ├── BalancesDisplay.tsx # Multi-chain wallet balances (Alchemy)
│   │   ├── DataSourcesView.tsx # Data source credits + usage
│   │   ├── TakeOwnership.tsx   # Wallet ownership transfer (RainbowKit)
│   │   ├── OpenClawSection.tsx # OpenClaw dashboard card
│   │   ├── PolymarketPositions.tsx # Polymarket positions display
│   │   ├── AppSidebar.tsx      # Sidebar navigation
│   │   ├── Layout.tsx          # Page layout wrapper
│   │   └── ui/                 # Reusable UI primitives (Button, Card, Badge)
│   │
│   ├── admin/                  # Admin panel
│   │   ├── pages/              # AdminDashboard, AdminWallets, AdminVpsPool, etc.
│   │   ├── routes.tsx
│   │   ├── nav.ts
│   │   └── api.ts              # Admin API client
│   │
│   └── utils/
│       └── format.ts           # Formatting utilities
│
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## Trade Manager (Backend-Integrated)

The trade manager is now part of the Vincent backend. Source code lives in `src/services/tradeManager/` with routes in `src/api/routes/tradeRules.routes.ts`.

```
src/services/tradeManager/
├── types.ts                        # Shared types (RuleLike, WorkerStatus, PriceUpdate)
├── ruleManager.service.ts          # Rule CRUD (multi-tenant, Zod validation)
├── eventLogger.service.ts          # Event logging (PostgreSQL native JSON)
├── positionMonitor.service.ts      # Position sync from polymarketSkill.getHoldings()
├── ruleExecutor.service.ts         # Rule evaluation + trade execution
├── polymarketWebSocket.service.ts  # Shared WebSocket connection to Polymarket
├── monitoringWorker.ts             # Background worker (start/stop lifecycle)
└── index.ts                        # Re-exports

src/api/routes/tradeRules.routes.ts # API routes (mounted under /api/skills/polymarket/rules)
```

The `trade-manager/` directory contains the original standalone implementation (historical reference).

## Skill Definitions (`skills/`)

```
skills/
├── wallet/SKILL.md             # EVM wallet skill instructions for agents
├── polymarket/SKILL.md         # Polymarket skill instructions
├── twitter/SKILL.md            # Twitter data source skill
├── brave-search/SKILL.md       # Brave Search data source skill
└── trade-manager/SKILL.md      # Trade manager skill (for OpenClaw agents)
```

## Skill CI (`skill-ci/`)

```
skill-ci/
├── src/
│   ├── agent.ts                # LLM agent harness (Vercel AI SDK + OpenRouter)
│   ├── tools.ts                # http_request tool definition
│   ├── types.ts                # Shared types
│   └── tests/                  # Per-skill test files
│       ├── wallet.test.ts
│       ├── polymarket.test.ts
│       ├── twitter.test.ts
│       └── brave-search.test.ts
├── package.json                # Separate deps (ai, @openrouter/ai-sdk-provider)
└── vitest.config.ts
```

## Database (`prisma/`)

```
prisma/
├── schema.prisma               # Full Prisma schema (all models)
└── migrations/                 # Auto-generated migration SQL files
```

## Plans (`plans/`)

Historical implementation plans. Not authoritative for current state — use these docs and the code itself as source of truth.

```
plans/
├── plan.md                     # Main product plan + implementation history
├── tasks.md                    # Task tracker (phases 1-17)
├── tradeManager/               # Trade manager plans
├── skillCi/                    # Skill CI plans
├── dataSources/                # Data sources plans
├── openclawDeployment/         # OpenClaw deployment plans
├── selfCustody/                # Wallet ownership transfer plans
└── audit_2026-02-10/           # Security audit report + fixes
```
