# OpenClaw 1-Click Deploy Plan

## Overview

Add an "OpenClaw" section to the Vincent dashboard that lets authenticated users deploy an OpenClaw instance on an OVH VPS with a single button click. The system provisions the VPS via the OVH API, installs OpenClaw automatically, and presents the user with their OpenClaw web UI URL once ready.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  Frontend (React)                                                    │
│                                                                      │
│  Dashboard.tsx                                                       │
│    ├── [existing secrets UI]                                         │
│    └── <OpenClawSection />                                           │
│          ├── "Deploy OpenClaw" button (no existing deployment)       │
│          ├── Deployment progress view (while provisioning)           │
│          └── Live instance card with link to web UI (when ready)     │
│                                                                      │
│  New page: OpenClawDetail.tsx                                        │
│    └── Manage instance (status, restart, destroy)                    │
│    └── <iframe src="https://<vps-ip>"> embedding OpenClaw web UI     │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
                    REST API calls (session auth)
                                │
┌───────────────────────────────▼──────────────────────────────────────┐
│  Backend (Express)                                                    │
│                                                                      │
│  POST   /api/openclaw/deploy          → Kick off VPS provisioning    │
│  GET    /api/openclaw/deployments      → List user's deployments     │
│  GET    /api/openclaw/deployments/:id  → Get deployment status       │
│  DELETE /api/openclaw/deployments/:id  → Destroy VPS                 │
│  POST   /api/openclaw/deployments/:id/restart → Restart OpenClaw     │
│                                                                      │
│  Services:                                                           │
│    ovh.service.ts        → OVH API client (order VPS, manage)        │
│    openrouter.service.ts → Provision per-instance OpenRouter API key  │
│    openclaw.service.ts   → Orchestrates deploy lifecycle             │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
              OVH API + OpenRouter API + SSH to provisioned VPS
                                │
┌───────────────────────────────▼──────────────────────────────────────┐
│  OVH VPS (US region)                                                  │
│                                                                      │
│  Ubuntu 22.04/24.04 LTS                                              │
│  OpenClaw gateway on localhost:18789                                 │
│  Caddy reverse proxy (TLS via Let's Encrypt IP address certs)        │
│  Configured for OpenRouter → google/gemini-3-flash-preview           │
│  Per-instance OpenRouter API key (provisioned at deploy time)        │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Database Changes

### New Prisma model: `OpenClawDeployment`

```prisma
model OpenClawDeployment {
  id              String   @id @default(cuid())
  userId          String
  user            User     @relation(fields: [userId], references: [id])

  // OVH identifiers
  ovhServiceName  String?  @unique   // VPS service name from OVH
  ovhOrderId      String?             // OVH order ID during provisioning

  // Instance details
  ipAddress       String?
  accessToken     String?             // gateway auth token from ~/.openclaw/openclaw.json on the VPS

  // OpenRouter
  openRouterKeyHash String?           // hash of the provisioned OpenRouter API key (for revocation)

  // Status tracking
  status          OpenClawStatus @default(PENDING)
  statusMessage   String?             // human-readable status detail
  provisionLog    String?  @db.Text   // log output from provisioning

  // Timestamps
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  readyAt         DateTime?           // when OpenClaw became accessible
  destroyedAt     DateTime?

  @@index([userId])
}

enum OpenClawStatus {
  PENDING           // user clicked deploy, order not yet placed
  ORDERING          // OVH order placed, waiting for VPS delivery
  PROVISIONING      // VPS delivered, running install script
  INSTALLING        // OpenClaw being installed via official install.sh
  READY             // OpenClaw is live and accessible
  ERROR             // something went wrong (see statusMessage)
  DESTROYING        // tear-down in progress
  DESTROYED         // VPS deleted
}
```

Add relation to `User` model:

```prisma
model User {
  // ... existing fields ...
  openclawDeployments OpenClawDeployment[]
}
```

---

## Backend Implementation

### 1. OVH Service (`src/services/ovh.service.ts`)

Uses the `ovh` npm package (official Node.js OVH API wrapper).

**Environment variables:**

```
OVH_APP_KEY=...
OVH_APP_SECRET=...
OVH_CONSUMER_KEY=...
OVH_ENDPOINT=ovh-us              # US endpoint
OPENROUTER_PROVISIONING_KEY=...  # Provisioning API key (key mgmt only, not completions)
```

**Key methods:**

```ts
class OvhService {
  // Order a new VPS from OVH
  async orderVps(planCode: string, region: string): Promise<{ orderId: string }>;

  // Check order status / wait for delivery
  async getOrderStatus(orderId: string): Promise<OvhOrderStatus>;

  // Get VPS details (IP, status, etc.)
  async getVpsDetails(serviceName: string): Promise<OvhVpsDetails>;

  // Reinstall VPS OS (Ubuntu) if needed
  async reinstallVps(serviceName: string, templateName: string): Promise<void>;

  // Terminate / delete VPS
  async terminateVps(serviceName: string): Promise<void>;

  // List available VPS plans for US region
  async listAvailablePlans(region: string): Promise<OvhVpsPlan[]>;
}
```

**VPS Spec:**

- Plans (in this order of priority): 'vps-2025-model1.LZ', 'vps-2025-model1-ca', 'vps-2025-model1', 'vps-2025-model2-ca', 'vps-2025-model3-ca', 'vps-2025-model2', 'vps-2025-model3'
- OS: Ubuntu 22.04 or 24.04 LTS
- Region: US (East or West or Canada, whatever's available)

### 2. OpenRouter Service (`src/services/openrouter.service.ts`)

Provisions a fresh OpenRouter API key per deployment so each instance has its own
isolated key. Uses the OpenRouter Key Management API with a **Provisioning Key**
(a special key type that can only manage keys, not make completions).

**API endpoint:** `POST https://openrouter.ai/api/v1/keys`

**Key methods:**

```ts
class OpenRouterService {
  // Create a new API key scoped to this deployment
  async createKey(
    name: string,
    options?: {
      limit?: number; // spending cap in USD (null = unlimited)
      limit_reset?: 'daily' | 'weekly' | 'monthly' | null;
      expires_at?: string; // ISO 8601 UTC
    }
  ): Promise<{ key: string; hash: string }>;

  // Delete a key when deployment is destroyed
  async deleteKey(hash: string): Promise<void>;

  // Get key usage stats (for future billing passthrough)
  async getKeyUsage(hash: string): Promise<{
    usage: number; // total USD spent
    usage_daily: number;
    usage_weekly: number;
    usage_monthly: number;
  }>;
}
```

**Per-deployment key creation:**

- Name: `openclaw-<deployment-short-id>` for easy identification in OpenRouter dashboard
- The provisioned key is written into the OpenClaw config on the VPS
- The key hash is stored in our DB for later revocation/usage tracking
- On deployment destroy, the key is deleted via the API

**Future: passthrough billing**

- Poll `getKeyUsage()` periodically or on-demand to track token spend per deployment
- Charge users via Stripe for their OpenRouter usage (metered billing)
- Can set `limit` on the key as a safety cap

### 3. OpenClaw Service (`src/services/openclaw.service.ts`)

Orchestrates the full deploy lifecycle.

**Key methods:**

```ts
class OpenClawService {
  // Main deploy orchestrator — runs as async background job
  async deploy(userId: string): Promise<OpenClawDeployment>;

  // Get deployment status
  async getDeployment(deploymentId: string, userId: string): Promise<OpenClawDeployment>;

  // List user's deployments
  async listDeployments(userId: string): Promise<OpenClawDeployment[]>;

  // Destroy a deployment
  async destroy(deploymentId: string, userId: string): Promise<void>;

  // Restart OpenClaw on the VPS
  async restart(deploymentId: string, userId: string): Promise<void>;
}
```

**Deploy flow (background job):**

```
1. Create OpenClawDeployment record (PENDING)
2. Provision a fresh OpenRouter API key via OpenRouter Key Management API
3. Call OVH API to order VPS (→ ORDERING)
4. Poll OVH order status until VPS is delivered (every 30s, timeout 15 min)
5. Retrieve VPS IP address (→ PROVISIONING)
6. SSH into VPS and run setup script (→ INSTALLING):
   a. Install prereqs (curl, caddy)
   b. Run official OpenClaw installer non-interactively
   c. Pre-install Vincent agent wallet skill (`npx --yes clawhub@latest install agentwallet`)
   d. Write OpenClaw config with OpenRouter API key, model, and gateway settings
   e. Configure Caddy to reverse proxy https://<vps-ip> → localhost:18789 (TLS via Let's Encrypt IP certs)
   f. Start OpenClaw gateway as systemd service
   g. Read access token from ~/.openclaw/openclaw.json (gateway.auth.token)
7. Poll OpenClaw health endpoint (https://<vps-ip>) until responsive (→ READY)
8. Store ipAddress, accessToken, openRouterKeyHash, and readyAt in database
```

**SSH execution:**

- Use `ssh2` npm package for programmatic SSH
- OVH VPS comes with root SSH access (key injected at order time)
- Generate a deployment-specific SSH key pair, store encrypted in the deployment record or use OVH's SSH key management API

### 3. Setup Script (runs on VPS via SSH)

OpenClaw provides an official install script at `https://openclaw.ai/install.sh` designed
for `curl | bash` usage. The script supports non-interactive flags which we leverage:

**Official installer features we use:**

- `--no-onboard` — skips interactive onboarding prompts
- `--install-method npm` or `--install-method git` — pick install strategy
- `--version <ver>` — pin a specific version
- Automatically installs Node.js v22+, git, pnpm as prerequisites
- Runs `openclaw doctor` post-install for migrations
- Manages the OpenClaw gateway daemon

```bash
#!/bin/bash
set -euo pipefail

# System setup
apt-get update
apt-get install -y curl caddy

# Run the official OpenClaw installer non-interactively
curl -fsSL https://openclaw.ai/install.sh | bash -s -- --no-onboard

# The installer handles: Node.js v22+, git, pnpm, openclaw itself,
# migrations (openclaw doctor), and gateway daemon setup.

# Pre-install the Vincent agent wallet skill
npx --yes clawhub@latest install agentwallet

# Configure OpenClaw: OpenRouter key, model, and gateway settings
# The OpenRouter key is passed in as an env var by our SSH script
# Gateway binds to loopback; Caddy handles external TLS
mkdir -p ~/.openclaw
if [ -f ~/.openclaw/openclaw.json ]; then
  python3 -c "
import json
with open('$HOME/.openclaw/openclaw.json') as f:
    cfg = json.load(f)
cfg.setdefault('env', {})
cfg['env']['OPENROUTER_API_KEY'] = '${OPENROUTER_API_KEY}'
cfg['model'] = 'openrouter/google/gemini-3-flash-preview'
cfg['gateway'] = {
    'mode': 'local',
    'bind': 'loopback',
    'controlUi': {
        'allowInsecureAuth': True
    },
    'trustedProxies': ['127.0.0.1/32', '::1/128'],
    'auth': cfg.get('gateway', {}).get('auth', {'mode': 'token', 'token': ''})
}
with open('$HOME/.openclaw/openclaw.json', 'w') as f:
    json.dump(cfg, f, indent=2)
"
else
  cat > ~/.openclaw/openclaw.json << OCCONFIG
{
  "env": {
    "OPENROUTER_API_KEY": "${OPENROUTER_API_KEY}"
  },
  "model": "openrouter/google/gemini-3-flash-preview",
  "gateway": {
    "mode": "local",
    "bind": "loopback",
    "controlUi": {
      "allowInsecureAuth": true
    },
    "trustedProxies": ["127.0.0.1/32", "::1/128"],
    "auth": {
      "mode": "token",
      "token": ""
    }
  }
}
OCCONFIG
fi

# Configure Caddy as reverse proxy with TLS (Let's Encrypt IP address certs)
# Caddy v2.9+ supports IP address certs via Let's Encrypt / ZeroSSL
# The VPS_IP is passed in as an env var by our SSH script
cat > /etc/caddy/Caddyfile << CADDY
https://${VPS_IP} {
    reverse_proxy localhost:18789
}
CADDY

systemctl enable caddy
systemctl restart caddy

# Configure firewall: allow SSH + HTTPS only
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp    # needed for Let's Encrypt HTTP-01 challenge
ufw allow 443/tcp   # HTTPS
ufw --force enable

# Extract the access token from OpenClaw's config and echo it back
# so our backend can store it and give it to the user
ACCESS_TOKEN=$(cat ~/.openclaw/openclaw.json | python3 -c "import sys,json; print(json.load(sys.stdin)['gateway']['auth']['token'])")
echo "OPENCLAW_ACCESS_TOKEN=${ACCESS_TOKEN}"

# Ensure OpenClaw gateway is running as a systemd service
# (The installer may already handle this — if not, we create the unit file)
if ! systemctl is-active --quiet openclaw-gateway; then
  cat > /etc/systemd/system/openclaw-gateway.service << 'UNIT'
[Unit]
Description=OpenClaw Gateway
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/openclaw gateway start
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
UNIT
  systemctl daemon-reload
  systemctl enable openclaw-gateway
  systemctl start openclaw-gateway
fi
```

**Note:** The installer's `--no-onboard` flag should handle all interactive prompts, but
we may need to also set environment variables (e.g. `OPENCLAW_*` or `CI=true`) if the
script has any other interactive fallbacks. We'll test this on a real VPS first.

### 4. Routes (`src/api/routes/openclaw.routes.ts`)

```ts
const router = Router();

// All routes require session auth
router.use(sessionAuthMiddleware);

// Deploy a new OpenClaw instance
router.post(
  '/deploy',
  asyncHandler(async (req, res) => {
    // Kick off deploy and return deployment record
    // Users can have multiple active deployments
  })
);

// List user's deployments
router.get(
  '/deployments',
  asyncHandler(async (req, res) => {
    // Return all deployments for the authenticated user
  })
);

// Get single deployment status
router.get(
  '/deployments/:id',
  asyncHandler(async (req, res) => {
    // Return deployment details + current status
  })
);

// Destroy a deployment
router.delete(
  '/deployments/:id',
  asyncHandler(async (req, res) => {
    // Terminate VPS, update status to DESTROYING
  })
);

// Restart OpenClaw on a deployment
router.post(
  '/deployments/:id/restart',
  asyncHandler(async (req, res) => {
    // SSH in and systemctl restart openclaw-gateway
  })
);
```

Mount in `src/api/routes/index.ts`:

```ts
router.use('/openclaw', openclawRouter);
```

---

## Frontend Implementation

### 1. New API functions (`frontend/src/api.ts`)

```ts
// OpenClaw
export const deployOpenClaw = () => api.post('/openclaw/deploy');
export const getOpenClawDeployments = () => api.get('/openclaw/deployments');
export const getOpenClawDeployment = (id: string) => api.get(`/openclaw/deployments/${id}`);
export const destroyOpenClawDeployment = (id: string) => api.delete(`/openclaw/deployments/${id}`);
export const restartOpenClawDeployment = (id: string) =>
  api.post(`/openclaw/deployments/${id}/restart`);
```

### 2. OpenClaw section in Dashboard (`frontend/src/components/OpenClawSection.tsx`)

A self-contained component rendered on the Dashboard page below the secrets list.

**States:**

| State                                                | UI                                                                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| No deployment                                        | Card with OpenClaw logo, description, "Deploy OpenClaw" button                                         |
| Deploying (PENDING/ORDERING/PROVISIONING/INSTALLING) | Progress card with status steps, spinner, status message                                               |
| Ready                                                | Card with green status badge, "Open" link (navigates to `/openclaw/:id` iframe view), "Destroy" option |
| Error                                                | Card with error message, "Retry" button, "Destroy" option                                              |
| Destroyed                                            | Same as "No deployment" state                                                                          |

**Progress steps shown during deploy:**

1. Ordering VPS... (PENDING/ORDERING)
2. Setting up server... (PROVISIONING)
3. Installing OpenClaw... (INSTALLING)
4. Ready! (READY)

**Polling:** While deploying, poll `GET /api/openclaw/deployments/:id` every 5 seconds until status is READY or ERROR.

### 3. OpenClaw Detail Page (`frontend/src/pages/OpenClawDetail.tsx`)

Route: `/openclaw/:id`

The main experience — embeds the OpenClaw web UI in a full-height iframe
pointing directly at the VPS IP over HTTPS:

```tsx
// The iframe src points directly to the VPS over HTTPS
// Caddy on the VPS provides TLS via Let's Encrypt IP address certs
// Auth token is passed as a URL parameter so the user doesn't need to log in
<iframe
  src={`https://${deployment.ipAddress}?token=${deployment.accessToken}`}
  className="w-full h-[calc(100vh-120px)] border rounded-lg"
  title="OpenClaw"
/>
```

**How auth works in the iframe:**

- Backend returns the `accessToken` as part of the deployment details (GET /api/openclaw/deployments/:id)
- Frontend injects it as a URL param `?token=` when constructing the iframe src
- OpenClaw's gateway accepts the token for authentication
- The token is only visible in the iframe src attribute, not exposed to the user directly

**Above the iframe:**

- Instance name / ID
- Status badge (green = ready)
- "Restart" button
- "Destroy" button (with confirmation dialog)

**Loading/error states:**

- If deployment not READY yet, show progress steps instead of iframe
- If deployment in ERROR state, show error message + retry option

### 4. Route & Nav Updates

**App.tsx** — add route:

```tsx
<Route
  path="/openclaw/:id"
  element={
    <ProtectedRoute>
      <OpenClawDetail />
    </ProtectedRoute>
  }
/>
```

**Layout.tsx** — add nav link:

```tsx
<Link to="/dashboard" className="text-sm text-gray-600 hover:text-gray-900">
  OpenClaw
</Link>
```

(This scrolls to / highlights the OpenClaw section on the dashboard, or could be a dedicated `/openclaw` page if we want to keep it separate.)

---

## Deploy Flow (End-to-End)

```
User clicks "Deploy OpenClaw"
        │
        ▼
Frontend calls POST /api/openclaw/deploy
        │
        ▼
Backend creates OpenClawDeployment (PENDING)
Returns deployment ID immediately
        │
        ├──► Frontend starts polling GET /api/openclaw/deployments/:id
        │
        ▼ (async background)
Backend provisions fresh OpenRouter API key (via Provisioning Key API)
        │
        ▼
Backend calls OVH API to order VPS (→ ORDERING)
        │
        ▼
OVH provisions VPS (1-5 minutes typically)
        │
        ▼
Backend detects VPS ready, gets IP (→ PROVISIONING)
        │
        ▼
Backend SSHs into VPS, runs install.sh + configures OpenRouter key/model (→ INSTALLING)
        │
        ▼
Backend reads access token from ~/.openclaw/openclaw.json on VPS
        │
        ▼
Backend polls OpenClaw health endpoint (https://<vps-ip>)
        │
        ▼
OpenClaw responds OK (→ READY, store ipAddress + accessToken)
        │
        ▼
Frontend poll sees READY status
Shows "Your OpenClaw is ready!" with "Open" button
        │
        ▼
User clicks "Open" → navigates to /openclaw/:id
OpenClaw web UI loads in iframe: <iframe src="https://<vps-ip>?token=...">
(Caddy on VPS provides TLS, auth token injected as URL param by frontend)
```

---

## Access Strategy: Direct HTTPS to VPS IP + Iframe

Each VPS runs Caddy as a reverse proxy with TLS certs for its bare IP address.
The frontend embeds the OpenClaw web UI in an iframe pointing directly at the VPS.
No DNS needed.

```
┌─────────────────────────────────────────────────────────────┐
│  Browser                                                     │
│  heyvincent.ai/openclaw/:id                                 │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  Vincent frontend (React)                                │ │
│  │  ┌───────────────────────────────────────────────────┐   │ │
│  │  │  <iframe src="https://<vps-ip>?token=...">        │   │ │
│  │  │                                                    │   │ │
│  │  │   OpenClaw Web UI                                  │   │ │
│  │  │   (direct HTTPS to VPS, auth via token param)      │   │ │
│  │  │                                                    │   │ │
│  │  └───────────────────────────────────────────────────┘   │ │
│  │  [Restart] [Destroy]                                     │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
                       │ https://<vps-ip>/*
                       ▼
┌──────────────────────────────────────────────────────────────┐
│  OVH VPS                                                      │
│  Caddy (443) → reverse_proxy localhost:18789                 │
│  TLS via Let's Encrypt IP address certificates (6-day, auto) │
│  OpenClaw gateway on localhost:18789                         │
│  Auth via gateway token (passed as ?token= URL param)        │
└──────────────────────────────────────────────────────────────┘
```

**TLS for IP addresses:**

- Let's Encrypt now issues TLS certs for bare IP addresses (GA since early 2026)
- Short-lived (6-day / 160-hour) certificates, auto-renewed by Caddy
- Validated via HTTP-01 challenge (port 80 must be open)
- No domain or DNS management needed

**Why this approach:**

- No DNS management — just use the VPS IP directly
- No backend proxying — avoids bandwidth/latency bottleneck through our server
- HTTPS everywhere — browser won't block mixed content in the iframe
- Auth is seamless — token injected as URL param by frontend, user never manages it
- Simple infrastructure — Caddy handles cert lifecycle automatically

---

## Security Considerations

1. **OVH API credentials** — stored as server-side env vars, never exposed to frontend
2. **SSH keys** — generated per deployment, private key stored encrypted in DB (using the same encryption approach as secrets)
3. **VPS access** — firewall (ufw) allows only ports 22 (SSH), 80 (HTTP-01 challenge), and 443 (HTTPS). OpenClaw gateway bound to loopback only, accessible via Caddy.
4. **OpenClaw auth** — gateway auth token stored in our DB, passed to frontend as part of deployment details. Frontend injects it as a URL param in the iframe src. Token is not displayed to the user as a copyable value.
5. **TLS** — Caddy auto-provisions Let's Encrypt IP address certificates (6-day, auto-renewed). All iframe traffic is HTTPS.
6. **OpenRouter keys** — each deployment gets its own key via Provisioning API; key is revoked when deployment is destroyed; provisioning key (env var) can only manage keys, not make completions
7. **Rate limiting** — limit deploy endpoint to prevent abuse
8. **Cost control** — track VPS + OpenRouter token costs per user, potentially tie to existing billing/subscription system

---

## Cost & Billing

**Infrastructure costs:**

- OVH VPS Starter (US): ~$3.50-6/month per instance

**LLM costs (OpenRouter):**

- Model: `openrouter/google/gemini-3-flash-preview`
- Each deployment has its own OpenRouter API key with usage tracking
- OpenRouter Provisioning API exposes per-key usage stats (`usage`, `usage_daily`, etc.)

**Billing strategy:**

- **MVP:** limit 1 deployment per user, absorb costs or set a spending cap on the OpenRouter key
- **Later — passthrough billing:** poll OpenRouter key usage, charge users for their token spend via Stripe metered billing (same pattern as existing gas usage billing)
- Can set `limit` on the OpenRouter key as a safety cap (e.g. $10/month) to prevent runaway costs

---

## New Dependencies

| Package | Purpose                            |
| ------- | ---------------------------------- |
| `ovh`   | Official OVH API Node.js client    |
| `ssh2`  | SSH into provisioned VPS for setup |

---

## Implementation Order

### Phase 1: Backend Foundation

1. Add `ovh` and `ssh2` packages
2. Create Prisma migration for `OpenClawDeployment` model
3. Implement `ovh.service.ts` — OVH API client
4. Implement `openrouter.service.ts` — OpenRouter key provisioning
5. Implement `openclaw.service.ts` — deploy orchestration (OVH + OpenRouter + SSH)
6. Implement `openclaw.routes.ts` — API endpoints
7. Mount routes in `index.ts`

### Phase 2: Frontend

7. Add OpenClaw API functions to `frontend/src/api.ts`
8. Build `OpenClawSection.tsx` component (dashboard card)
9. Build `OpenClawDetail.tsx` page
10. Add route in `App.tsx`
11. Add nav link in `Layout.tsx`

### Phase 3: Infrastructure

12. Write and test the VPS setup script against a real OVH VPS
13. Test end-to-end deploy flow (deploy → Caddy TLS on IP → iframe)

### Phase 4: Hardening

15. Add error recovery (retry failed provisions, cleanup orphaned VPS + revoke orphaned OpenRouter keys)
16. Add deployment timeout handling (cancel after 20 min)
17. Add monitoring / health checks for running instances
18. Add OpenRouter usage tracking + passthrough billing via Stripe

---

## Resolved Questions

1. **OpenClaw port** — Web UI / gateway listens on `localhost:18789`. Caddy reverse proxies to it with TLS on the VPS IP.
2. **OpenClaw auth** — Gateway auth token at `gateway.auth.token` in `~/.openclaw/openclaw.json`. Stored in our DB, injected by frontend as `?token=` URL param in iframe src.
3. **Database** — OpenClaw does not need a database.
4. **LLM provider** — OpenRouter, using model `openrouter/google/gemini-3-flash-preview`. Each deployment gets a fresh OpenRouter API key provisioned via the Provisioning Key API.
5. **Billing model (LLM)** — passthrough billing of OpenRouter token charges via Stripe, but saved for later. MVP absorbs costs or sets a spending cap.
6. **VPS plan** — `vps-2025-model1` (4 vCPUs, 8 GB RAM). Plenty for OpenClaw + Node.js v22.
7. **Multiple instances** — yes, users can deploy multiple instances. No per-user limit (beyond rate limiting on the deploy endpoint).
8. **openclaw.json schema** — OpenRouter key goes in `env.OPENROUTER_API_KEY`, model in `model`, gateway access token is at `gateway.auth.token`.

## Open Questions

1. **Install script edge cases** — Does `--no-onboard` fully suppress all interactive prompts? May need `CI=true` or `NONINTERACTIVE=1` as additional env vars. Need to test on a real VPS.
