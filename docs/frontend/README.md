# Frontend Overview

The frontend is a React + TypeScript SPA in `frontend/`, built with Vite and styled with Tailwind CSS v4.

## Tech Stack

| Technology | Version | Notes |
|---|---|---|
| React | 18+ | With TypeScript |
| Vite | Latest | Dev server proxies `/api` to backend on port 3000 |
| Tailwind CSS | v4 | Uses `@tailwindcss/vite` plugin, `@import "tailwindcss"` syntax |
| React Router | v7 | Protected routes + public-only routes |
| Axios | Latest | API client with session token management |
| Stytch | `@stytch/react` | Pre-built UI SDK for login |
| RainbowKit | v2 | Wallet connection for ownership transfer |
| wagmi | v2 | Ethereum hooks |
| TanStack Query | v5 | Query client (required by wagmi) |

## Authentication

- `StytchProvider` wraps the app with a `StytchUIClient`
- Login page renders `<StytchLogin>` with email magic links + Google OAuth
- Auth callback detects Stytch session, syncs to backend via `POST /api/auth/session`
- Session token stored in localStorage
- API client auto-removes session and redirects to `/login` on 401

**Providers (in `main.tsx`):** WagmiProvider → QueryClientProvider → RainbowKitProvider → StytchProvider → AuthProvider → App

## Pages

| Page | Route | Description |
|---|---|---|
| Login | `/login` | Stytch UI SDK login |
| AuthCallback | `/auth/callback` | Session exchange |
| Dashboard | `/dashboard` | Secret list + OpenClaw section |
| SecretDetail | `/secrets/:id` | Tabbed: policies, API keys, audit logs, balances |
| Claim | `/claim` | Secret claim flow (no layout, accessible pre-login) |
| OpenClawDetail | `/openclaw/:id` | Instance management + iframe |
| AgentsLayout | `/agents` | Tabbed layout (Deploy Agent / Connect Agent) |
| AgentsConnect | `/agents/connect` | MCP connection guide for external agents |
| Account | `/account` | Account settings |
| Billing | `/billing` | Subscription, usage, invoices |
| Landing | `/` | Landing page |
| Features/Skills/Security/Terms/Agents | Various | Marketing pages |

## Key Components

### SecretDetail Page

The most complex page — conditionally renders different content based on secret type:

- **EVM_WALLET:** Balances (Alchemy), TakeOwnership, Polymarket positions
- **DATA_SOURCES:** DataSourcesView (credits, usage, source cards)
- **All types:** PolicyManager, ApiKeyManager, AuditLogViewer tabs

### Component Inventory

| Component | What it does |
|---|---|
| `PolicyManager` | CRUD for policies with dynamic config forms per type |
| `ApiKeyManager` | Create/list/revoke API keys, one-time key display + clipboard |
| `AuditLogViewer` | Filterable list, expandable entries, CSV/JSON export |
| `BalancesDisplay` | Multi-chain token balances grouped by network |
| `DataSourcesView` | Credit balance, data source cards, usage history, add credits |
| `TakeOwnership` | Wallet ownership transfer (RainbowKit connection + signing) |
| `OpenClawSection` | Dashboard card with deploy/progress/ready states |
| `ConnectAgents` | MCP connection guide — skill selector + accordion setup guides for 7 runtimes |
| `PolymarketPositions` | Polymarket positions display |

### Admin Panel

Under `frontend/src/admin/`:
- Separate routes, nav, and API client
- Pages: AdminDashboard, AdminWallets, AdminVpsPool, AdminReferrals, AdminActiveAgents

## API Client

`frontend/src/api.ts` — Axios wrapper with:
- Session token in Authorization header
- Auto-redirect to `/login` on 401
- Functions for every API endpoint (typed)
- Base URL from Vite proxy in dev, same-origin in prod

## Patterns

- Auth state in React context + localStorage for persistence
- API responses accessed at `res.data.data` (backend wraps in `sendSuccess`)
- TypeScript interfaces defined locally in components (no shared types package)
- Modals use fixed overlay with `bg-black/60 backdrop-blur-sm`, `stopPropagation`
- Progress bars reuse conditional color pattern (green/yellow/red thresholds)

## Build

```bash
cd frontend
npm run dev     # Dev server with API proxy
npm run build   # Production build (output to dist/)
npx tsc         # Type check
```

Vite dev server proxies `/api` requests to `http://localhost:3000`.

## Files

```
frontend/src/
├── App.tsx          # Routing
├── main.tsx         # Provider stack
├── api.ts           # API client
├── auth.tsx         # Auth context
├── wagmi.ts         # Wagmi config
├── pages/           # Route pages
├── components/      # Feature components
├── admin/           # Admin panel
└── utils/           # Formatting helpers
```
