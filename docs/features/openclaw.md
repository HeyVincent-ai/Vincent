# OpenClaw 1-Click Deploy

Vincent's dashboard lets users deploy an OpenClaw AI agent instance on an OVH VPS with a single button click. The system handles VPS provisioning, OpenClaw installation, LLM API key setup, and TLS configuration automatically.

## How It Works

### Deploy Flow

```
User clicks "Deploy OpenClaw — $25/mo"
  → Frontend creates Stripe Checkout session
  → User completes payment
  → Webhook: checkout.session.completed
    → Provision OpenRouter API key
    → Order OVH VPS
    → Poll until VPS delivered (1-5 min)
    → SSH into VPS, run setup script:
        - Install Node.js, Caddy, OpenClaw
        - Pre-install Vincent skills (wallet, polymarket, data sources)
        - Write API keys to credential files
        - Configure OpenRouter key + model
        - Set up Caddy for HTTPS (Let's Encrypt IP certs)
        - Start OpenClaw as systemd service
    → Poll health endpoint until responsive
    → Store IP, access token → status READY
  → Frontend shows "Your OpenClaw is ready!"
  → User opens /openclaw/:id → iframe to https://<vps-ip>?token=...
```

### Cancel Flow

- Cancel sets `cancel_at_period_end` on Stripe subscription
- VPS continues running until billing period ends
- `customer.subscription.deleted` webhook triggers teardown
- VPS terminated, OpenRouter key revoked → status DESTROYED

### Destroy Now

- Immediately cancels Stripe subscription
- Terminates VPS, revokes OpenRouter key
- No refund

## Architecture

```
Frontend (iframe)
  │ https://<vps-ip>?token=...
  ▼
OVH VPS
  ├── Caddy (port 443) → reverse_proxy localhost:18789
  │   └── TLS via Let's Encrypt IP address certificates (auto-renewed)
  ├── OpenClaw gateway (port 18789, loopback only)
  │   ├── Auth via gateway token
  │   └── Configured with OpenRouter API key
  ├── Vincent skills pre-installed
  │   ├── Wallet (agentwallet)
  │   ├── Polymarket
  │   ├── Twitter
  │   └── Brave Search
  └── Trade Manager (systemd service, port 19000)
```

**Why direct HTTPS to VPS IP:**
- No DNS management needed
- No backend proxy bottleneck
- Caddy handles cert lifecycle automatically (Let's Encrypt IP certs, 6-day, auto-renewed)
- Auth token injected by frontend as URL param in iframe src

## Billing

### Deployment Subscription ($25/month)

- Each deployment requires its own Stripe subscription
- Payment required before provisioning begins
- Multiple deployments allowed (each with own subscription)

### LLM Credits

- $25 free credits per deployment
- OpenRouter key created with `limit: 25` (spending cap)
- Usage polled from OpenRouter per-key stats every 60s (cached)
- Users add credits via "Add Credits" button ($5-$500)
- Stripe off-session charge → increment balance → update OpenRouter key limit
- When credits hit $0: OpenRouter auto-blocks the key

## Pre-Provisioned Secrets

During VPS setup, Vincent creates and pre-claims three secrets:

1. `DATA_SOURCES` secret → API key for Twitter/Brave Search
2. `EVM_WALLET` secret → API key for wallet operations
3. `POLYMARKET_WALLET` secret → API key for Polymarket trading

API keys written to VPS credential files. Agent is ready to use all skills immediately.

Secret IDs stored on `OpenClawDeployment.vincentSecretIds` for reference. On reprovision, new API keys are generated for existing secrets (since plain keys can't be recovered from the stored one-way hashes).

## Deployment States

| Status | Description |
|---|---|
| `PENDING_PAYMENT` | Checkout session created, waiting for payment |
| `PENDING` | Payment confirmed, VPS order not yet placed |
| `ORDERING` | OVH order placed, waiting for delivery |
| `PROVISIONING` | VPS delivered, running setup script |
| `INSTALLING` | OpenClaw being installed |
| `READY` | Live and accessible |
| `CANCELING` | Subscription set to cancel at period end |
| `ERROR` | Something went wrong (see statusMessage) |
| `DESTROYING` | Teardown in progress |
| `DESTROYED` | VPS deleted |

## Hardening

A unified background worker runs every 5 minutes:

- **Timeout handling:** PENDING_PAYMENT (1h), ORDERING (20min), PROVISIONING/INSTALLING (30min)
- **Cleanup:** Orphaned VPS + OpenRouter keys from failed provisions
- **Health monitoring:** In-memory failure counter, warns after 3 consecutive failures
- **Rate limiting:** 1 deploy/minute per user, max 3 active deployments

Retry cleans up partial resources and re-provisions from scratch (simpler than mid-provision resume).

## Resume on Restart

When the server starts, it resumes any interrupted provisions by checking for deployments in intermediate states (PENDING, ORDERING, PROVISIONING, INSTALLING). If API keys aren't in memory, they're regenerated from stored secret IDs.

## Files

| File | Responsibility |
|---|---|
| `src/services/openclaw.service.ts` | Full lifecycle orchestration |
| `src/services/ovh.service.ts` | OVH VPS API client |
| `src/services/openrouter.service.ts` | OpenRouter key provisioning + usage |
| `src/api/routes/openclaw.routes.ts` | REST endpoints |
| `frontend/src/components/OpenClawSection.tsx` | Dashboard card |
| `frontend/src/pages/OpenClawDetail.tsx` | Instance management + iframe |
