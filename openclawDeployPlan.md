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

  // Billing
  stripeSubscriptionId String?  @unique   // Stripe subscription ID for $25/mo
  currentPeriodEnd     DateTime?          // when the current billing period ends
  canceledAt           DateTime?          // when user requested cancellation

  // Token billing (LLM credits)
  creditBalanceUsd     Decimal  @default(25.00)  // available credits in USD ($25 free included)
  lastKnownUsageUsd    Decimal  @default(0)      // last polled total usage from OpenRouter
  lastUsagePollAt      DateTime?                  // when we last polled OpenRouter for usage
  creditPurchases      OpenClawCreditPurchase[]

  // Timestamps
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  readyAt         DateTime?           // when OpenClaw became accessible
  destroyedAt     DateTime?

  @@index([userId])
}

enum OpenClawStatus {
  PENDING_PAYMENT   // checkout session created, waiting for payment
  PENDING           // payment confirmed, order not yet placed
  ORDERING          // OVH order placed, waiting for VPS delivery
  PROVISIONING      // VPS delivered, running install script
  INSTALLING        // OpenClaw being installed via official install.sh
  READY             // OpenClaw is live and accessible
  CANCELING         // subscription set to cancel at period end, VPS still running
  ERROR             // something went wrong (see statusMessage)
  DESTROYING        // tear-down in progress
  DESTROYED         // VPS deleted
}
```

### New Prisma model: `OpenClawCreditPurchase`

```prisma
model OpenClawCreditPurchase {
  id                    String   @id @default(cuid())
  deploymentId          String
  deployment            OpenClawDeployment @relation(fields: [deploymentId], references: [id])

  amountUsd             Decimal             // amount purchased (e.g. 10.00)
  stripePaymentIntentId String   @unique    // Stripe PaymentIntent ID for the charge

  createdAt             DateTime @default(now())

  @@index([deploymentId])
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
STRIPE_OPENCLAW_PRICE_ID=...     # Stripe Price ID for $25/mo OpenClaw subscription
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

  // Get key usage stats (per-key USD totals from OpenRouter)
  async getKeyUsage(hash: string): Promise<{
    usage: number;         // total USD spent (all-time)
    usage_daily: number;   // USD spent today (UTC)
    usage_weekly: number;  // USD spent this week (UTC, Mon-Sun)
    usage_monthly: number; // USD spent this month (UTC)
    limit: number | null;
    limit_remaining: number | null;
  }>;

  // Update the spending limit on an OpenRouter key
  async updateKeyLimit(hash: string, newLimit: number): Promise<void>;
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
  // Main deploy orchestrator — creates checkout session, provisioning starts after payment
  async deploy(userId: string, successUrl: string, cancelUrl: string): Promise<{ deployment: OpenClawDeployment; checkoutUrl: string }>;

  // Called by webhook after checkout.session.completed — starts VPS provisioning
  async startProvisioning(deploymentId: string): Promise<void>;

  // Get deployment status
  async getDeployment(deploymentId: string, userId: string): Promise<OpenClawDeployment>;

  // List user's deployments
  async listDeployments(userId: string): Promise<OpenClawDeployment[]>;

  // Cancel subscription (sets cancel_at_period_end, VPS stays running until expiry)
  async cancel(deploymentId: string, userId: string): Promise<void>;

  // Destroy a deployment immediately (called by webhook on subscription expiry)
  async destroy(deploymentId: string, userId: string): Promise<void>;

  // Restart OpenClaw on the VPS
  async restart(deploymentId: string, userId: string): Promise<void>;

  // Called by webhook on customer.subscription.deleted — destroys VPS after subscription expires
  async handleSubscriptionExpired(stripeSubscriptionId: string): Promise<void>;

  // Token billing: get current usage stats from OpenRouter (polls + caches)
  async getUsage(deploymentId: string, userId: string): Promise<{
    creditBalanceUsd: number;     // total credits available
    totalUsageUsd: number;        // total spent on OpenRouter
    remainingUsd: number;         // creditBalanceUsd - totalUsageUsd
    usageDailyUsd: number;        // today's usage
    usageMonthlyUsd: number;      // this month's usage
    lastPolledAt: Date | null;
  }>;

  // Token billing: add credits by charging user's existing Stripe payment method
  async addCredits(deploymentId: string, userId: string, amountUsd: number): Promise<{
    success: boolean;
    newBalanceUsd: number;
    paymentIntentId?: string;
    requiresAction?: boolean;     // true if 3D Secure required
    clientSecret?: string;        // for frontend to complete 3D Secure
  }>;
}
```

**Deploy flow (checkout + background job):**

```
1. Create OpenClawDeployment record (PENDING_PAYMENT)
2. Create Stripe Checkout session for STRIPE_OPENCLAW_PRICE_ID ($25/mo)
   - metadata: { deploymentId, userId }
   - Return checkout URL to frontend for redirect
3. User completes payment on Stripe Checkout
4. Webhook: checkout.session.completed → update deployment (→ PENDING), start provisioning:
   a. Store stripeSubscriptionId, currentPeriodEnd on deployment
   b. Provision a fresh OpenRouter API key via OpenRouter Key Management API
   c. Call OVH API to order VPS (→ ORDERING)
   d. Poll OVH order status until VPS is delivered (every 30s, timeout 15 min)
   e. Retrieve VPS IP address (→ PROVISIONING)
   f. SSH into VPS and run setup script (→ INSTALLING):
      - Install prereqs (curl, caddy)
      - Run official OpenClaw installer non-interactively
      - Pre-install Vincent agent wallet skill (`npx --yes clawhub@latest install agentwallet`)
      - Write OpenClaw config with OpenRouter API key, model, and gateway settings
      - Configure Caddy to reverse proxy https://<vps-ip> → localhost:18789 (TLS via Let's Encrypt IP certs)
      - Start OpenClaw gateway as systemd service
      - Read access token from ~/.openclaw/openclaw.json (gateway.auth.token)
   g. Poll OpenClaw health endpoint (https://<vps-ip>) until responsive (→ READY)
   h. Store ipAddress, accessToken, openRouterKeyHash, and readyAt in database
```

**Cancel flow (graceful, keeps VPS until subscription expires):**

```
1. User clicks "Cancel" on deployment
2. POST /api/openclaw/deployments/:id/cancel
3. Backend sets cancel_at_period_end: true on Stripe subscription
4. Update deployment: canceledAt = now, status → CANCELING
5. Frontend shows "Active until <currentPeriodEnd>" with status badge
6. VPS continues running until subscription period ends
7. Webhook: customer.subscription.deleted → fires when period actually ends
8. Backend destroys VPS, revokes OpenRouter key (→ DESTROYING → DESTROYED)
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

// Deploy a new OpenClaw instance (creates Stripe checkout session)
router.post(
  '/deploy',
  asyncHandler(async (req, res) => {
    // Create deployment record (PENDING_PAYMENT) + Stripe checkout session
    // Return { deploymentId, checkoutUrl } for frontend redirect
    // Provisioning starts after checkout.session.completed webhook
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
    // Return deployment details + current status + billing info
    // Includes: stripeSubscriptionId, currentPeriodEnd, canceledAt
  })
);

// Cancel a deployment (cancels subscription at period end, VPS stays running)
router.post(
  '/deployments/:id/cancel',
  asyncHandler(async (req, res) => {
    // Set cancel_at_period_end on Stripe subscription
    // Update deployment: canceledAt, status → CANCELING
    // VPS destroyed later by webhook when subscription actually expires
  })
);

// Destroy a deployment immediately (also cancels Stripe subscription immediately)
router.delete(
  '/deployments/:id',
  asyncHandler(async (req, res) => {
    // Cancel Stripe subscription immediately (no refund)
    // Terminate VPS, revoke OpenRouter key, status → DESTROYING
  })
);

// Restart OpenClaw on a deployment
router.post(
  '/deployments/:id/restart',
  asyncHandler(async (req, res) => {
    // SSH in and systemctl restart openclaw-gateway
  })
);

// Get LLM token usage for a deployment (polls OpenRouter, caches result)
router.get(
  '/deployments/:id/usage',
  asyncHandler(async (req, res) => {
    // Returns: creditBalanceUsd, totalUsageUsd, remainingUsd, usageDailyUsd, usageMonthlyUsd
    // Polls OpenRouter getKeyUsage() if last poll > 60s ago, otherwise returns cached
  })
);

// Add LLM credits to a deployment (charges user's existing Stripe payment method)
router.post(
  '/deployments/:id/credits',
  asyncHandler(async (req, res) => {
    // Body: { amountUsd: number } (min $5, max $500)
    // Charges user's Stripe customer off-session via PaymentIntent
    // If successful: increments creditBalanceUsd, updates OpenRouter key limit, creates CreditPurchase record
    // If 3D Secure required: returns { requiresAction: true, clientSecret } for frontend
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
export const deployOpenClaw = (successUrl: string, cancelUrl: string) =>
  api.post('/openclaw/deploy', { successUrl, cancelUrl });
export const getOpenClawDeployments = () => api.get('/openclaw/deployments');
export const getOpenClawDeployment = (id: string) => api.get(`/openclaw/deployments/${id}`);
export const cancelOpenClawDeployment = (id: string) =>
  api.post(`/openclaw/deployments/${id}/cancel`);
export const destroyOpenClawDeployment = (id: string) => api.delete(`/openclaw/deployments/${id}`);
export const restartOpenClawDeployment = (id: string) =>
  api.post(`/openclaw/deployments/${id}/restart`);
export const getOpenClawUsage = (id: string) => api.get(`/openclaw/deployments/${id}/usage`);
export const addOpenClawCredits = (id: string, amountUsd: number) =>
  api.post(`/openclaw/deployments/${id}/credits`, { amountUsd });
```

### 2. OpenClaw section in Dashboard (`frontend/src/components/OpenClawSection.tsx`)

A self-contained component rendered on the Dashboard page below the secrets list.

**States:**

| State                                                | UI                                                                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| No deployment                                        | Card with OpenClaw logo, description, "Deploy OpenClaw — $25/mo" button                               |
| Pending payment (PENDING_PAYMENT)                    | Card with "Completing payment..." message (user redirected to Stripe Checkout)                         |
| Deploying (PENDING/ORDERING/PROVISIONING/INSTALLING) | Progress card with status steps, spinner, status message                                               |
| Ready                                                | Card with green status badge, "Open" link, "Cancel" option (cancel subscription)                       |
| Canceling (CANCELING)                                | Card with orange badge, "Active until [date]", "Open" link still works, "Destroy Now" option           |
| Error                                                | Card with error message, "Retry" button, "Destroy" option                                              |
| Destroyed                                            | Same as "No deployment" state                                                                          |

**Progress steps shown during deploy:**

1. Completing payment... (PENDING_PAYMENT)
2. Ordering VPS... (PENDING/ORDERING)
3. Setting up server... (PROVISIONING)
4. Installing OpenClaw... (INSTALLING)
5. Ready! (READY)

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
User clicks "Deploy OpenClaw — $25/mo"
        │
        ▼
Frontend calls POST /api/openclaw/deploy { successUrl, cancelUrl }
        │
        ▼
Backend creates OpenClawDeployment (PENDING_PAYMENT)
Creates Stripe Checkout session (STRIPE_OPENCLAW_PRICE_ID, metadata: { deploymentId, userId })
Returns { deploymentId, checkoutUrl }
        │
        ▼
Frontend redirects user to Stripe Checkout (checkoutUrl)
        │
        ▼
User completes payment on Stripe
        │
        ▼
Stripe redirects user back to successUrl (e.g. /dashboard?openclaw_deploy=success)
        │
        ├──► Frontend starts polling GET /api/openclaw/deployments/:id
        │
        ▼ (webhook: checkout.session.completed)
Backend updates deployment: stripeSubscriptionId, currentPeriodEnd (→ PENDING)
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

### Cancellation Flow (End-to-End)

```
User clicks "Cancel" on deployment
        │
        ▼
Frontend calls POST /api/openclaw/deployments/:id/cancel
        │
        ▼
Backend sets cancel_at_period_end: true on Stripe subscription
Updates deployment: canceledAt = now, status → CANCELING
Returns { currentPeriodEnd } to frontend
        │
        ▼
Frontend shows "Active until <date>" with orange status badge
OpenClaw instance continues working normally
        │
        ... time passes, subscription period ends ...
        │
        ▼ (webhook: customer.subscription.deleted)
Backend calls handleSubscriptionExpired(stripeSubscriptionId)
Looks up deployment by stripeSubscriptionId
        │
        ▼
Backend terminates OVH VPS (→ DESTROYING)
Revokes OpenRouter API key
        │
        ▼
Deployment status → DESTROYED, destroyedAt = now
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
8. **Cost control** — each deployment requires a $25/mo Stripe subscription; VPS provisioning only begins after confirmed payment via webhook; subscription expiry automatically triggers VPS teardown

---

## Cost & Billing

**Infrastructure costs:**

- OVH VPS Starter (US): ~$3.50-6/month per instance

**LLM costs (OpenRouter):**

- Model: `openrouter/google/gemini-3-flash-preview`
- Each deployment has its own OpenRouter API key with usage tracking
- OpenRouter Provisioning API exposes per-key usage stats (`usage`, `usage_daily`, etc.)

**Subscription billing ($25/mo per deployment):**

- Each deployment requires an active Stripe subscription at `STRIPE_OPENCLAW_PRICE_ID` ($25/mo)
- Deploy flow creates a Stripe Checkout session before provisioning begins
- Provisioning only starts after `checkout.session.completed` webhook confirms payment
- Cancellation sets `cancel_at_period_end: true` — VPS stays running until the billing period ends
- When subscription expires (`customer.subscription.deleted` webhook), VPS is destroyed automatically
- Users can also "Destroy Now" to immediately cancel the subscription and tear down the VPS

**LLM token billing (credit-based):**

- Each deployment starts with **$25 free credits** for LLM usage (`creditBalanceUsd = 25.00`)
- OpenRouter key is created with `limit: 25` (spending cap matches credit balance)
- Backend polls `GET /api/v1/keys/:hash` for per-key usage in USD (`usage`, `usage_daily`, `usage_monthly`)
- Dashboard shows usage card: "Used $X.XX / $25.00 credits remaining" with progress bar
- When credits run low, user clicks **"Add Credits"** → enters dollar amount → charges existing Stripe payment method
- Stripe charge uses `paymentIntents.create()` with `off_session: true` + customer's default payment method (no re-entering card)
- On successful charge: increment `creditBalanceUsd` in DB, update OpenRouter key `limit` to new total
- If 3D Secure is required, frontend completes authentication using Stripe.js + returned `clientSecret`
- When credits reach $0, OpenRouter automatically blocks the key (via its `limit` feature) — user sees "Credits exhausted" and must add more

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

### Phase 4: Billing ($25/mo per deployment)

14. Add `STRIPE_OPENCLAW_PRICE_ID` to env schema (`src/utils/env.ts`)
15. Add Prisma migration: `stripeSubscriptionId`, `currentPeriodEnd`, `canceledAt` fields + `PENDING_PAYMENT` / `CANCELING` enum values on `OpenClawDeployment`
16. Update `openclaw.service.ts` deploy flow: create Stripe Checkout session → return checkout URL, move VPS provisioning to be triggered by webhook
17. Add OpenClaw-specific webhook handlers in billing routes: `checkout.session.completed` (start provisioning), `customer.subscription.deleted` (destroy VPS), `invoice.payment_failed` (mark deployment)
18. Add `POST /api/openclaw/deployments/:id/cancel` route — sets `cancel_at_period_end` on Stripe, updates deployment status to `CANCELING`
19. Update `DELETE /api/openclaw/deployments/:id` to also cancel the Stripe subscription immediately
20. Update frontend: deploy button → redirect to Stripe Checkout, add cancel flow, show "Active until [date]" for canceling deployments, show $25/mo pricing
21. Test end-to-end billing flow: checkout → deploy → cancel → wait for expiry → VPS destroyed

### Phase 5: Token Billing (LLM credit system)

22. Add Prisma migration: `creditBalanceUsd`, `lastKnownUsageUsd`, `lastUsagePollAt` on `OpenClawDeployment` + new `OpenClawCreditPurchase` model
23. Add `updateKeyLimit()` to `openrouter.service.ts` — PATCH key spending limit via OpenRouter API
24. Update deploy flow: create OpenRouter key with `limit: 25` ($25 free credits), set `creditBalanceUsd = 25.00`
25. Add `GET /api/openclaw/deployments/:id/usage` route — polls OpenRouter `getKeyUsage()`, caches in DB, returns usage + credit balance
26. Add `POST /api/openclaw/deployments/:id/credits` route — validate amount ($5-$500), charge Stripe off-session (`paymentIntents.create` with `off_session: true`, customer's default payment method), increment credits, update OpenRouter key limit, create `OpenClawCreditPurchase` record
27. Add `chargeCustomerOffSession()` to `stripe.service.ts` — gets customer default payment method, creates PaymentIntent, handles `authentication_required` error (returns `clientSecret` for 3D Secure)
28. Update frontend `OpenClawDetail.tsx`: add usage card (progress bar: used/remaining), poll usage on page load, "Add Credits" button → modal with amount input → calls addCredits API → handles 3D Secure if needed via Stripe.js
29. Update `OpenClawSection.tsx` dashboard card: show credit balance summary for READY deployments ("$X.XX credits remaining")
30. Add background job / cron: poll OpenRouter usage for all READY deployments every 5 min, update `lastKnownUsageUsd`, optionally warn when credits < $5 remaining

### Phase 6: Hardening

31. Add error recovery (retry failed provisions, cleanup orphaned VPS + revoke orphaned OpenRouter keys)
32. Add deployment timeout handling (cancel after 20 min)
33. Add monitoring / health checks for running instances

---

## Resolved Questions

1. **OpenClaw port** — Web UI / gateway listens on `localhost:18789`. Caddy reverse proxies to it with TLS on the VPS IP.
2. **OpenClaw auth** — Gateway auth token at `gateway.auth.token` in `~/.openclaw/openclaw.json`. Stored in our DB, injected by frontend as `?token=` URL param in iframe src.
3. **Database** — OpenClaw does not need a database.
4. **LLM provider** — OpenRouter, using model `openrouter/google/gemini-3-flash-preview`. Each deployment gets a fresh OpenRouter API key provisioned via the Provisioning Key API.
5. **Billing model (LLM)** — credit-based system. $25 free credits per deployment. Users add more via "Add Credits" button which charges their existing Stripe payment method off-session. OpenRouter key `limit` is kept in sync with credit balance. Per-key usage polled from `GET /api/v1/keys/:hash` (returns USD totals: `usage`, `usage_daily`, `usage_monthly`).
6. **VPS plan** — `vps-2025-model1` (4 vCPUs, 8 GB RAM). Plenty for OpenClaw + Node.js v22.
7. **Multiple instances** — yes, users can deploy multiple instances. Each requires its own $25/mo subscription. No per-user limit (beyond rate limiting on the deploy endpoint).
9. **Billing model (deployment)** — $25/mo per deployment via Stripe subscription (`STRIPE_OPENCLAW_PRICE_ID`). Payment required before provisioning. On cancel, VPS stays running until subscription period ends. Follows existing `stripe.service.ts` patterns (checkout sessions, webhook handling).
8. **openclaw.json schema** — OpenRouter key goes in `env.OPENROUTER_API_KEY`, model in `model`, gateway access token is at `gateway.auth.token`.

## Learnings from Phase 4 Implementation

1. **Stripe Checkout metadata**: Use `metadata: { type: 'openclaw', deploymentId, userId }` on checkout sessions to distinguish OpenClaw checkouts from standard subscription checkouts in the shared webhook handler.
2. **Webhook handler branching**: The existing `handleCheckoutCompleted`, `handleSubscriptionDeleted`, and `handleInvoicePaymentFailed` handlers in `stripe.service.ts` were extended to check for OpenClaw subscriptions (by looking up `prisma.openClawDeployment.findFirst({ where: { stripeSubscriptionId } })`) before falling through to the standard subscription logic.
3. **Stripe v2026+ period dates**: Period dates are on `subscription.items.data[0].current_period_start/end`, not on the subscription itself.
4. **Deploy flow change**: `deploy()` no longer starts provisioning immediately. It creates a `PENDING_PAYMENT` deployment + Stripe Checkout session. Provisioning begins only when the `checkout.session.completed` webhook fires, via `startProvisioning()`.
5. **E2E billing test pattern**: Test subscriptions created with `payment_behavior: 'default_incomplete'` (no real payment method on test customer) get status `incomplete_expired` when canceled, not `canceled`. Assertions should accept both. Call `startProvisioning()` directly to simulate webhook rather than trying to forge webhook signatures.

## Learnings from Phase 5 Implementation

1. **Stripe off-session charges**: Use `paymentIntents.create()` with `off_session: true, confirm: true` + customer's default payment method from `customer.invoice_settings.default_payment_method`. Test with `tok_visa` attached to test customers.
2. **3D Secure handling**: Catch `authentication_required` error code, extract `client_secret` from `err.raw.payment_intent`, return to frontend for Stripe.js `confirmCardPayment()`.
3. **Prisma Decimal fields**: Use `@db.Decimal(10, 2)` for USD amounts. Access via `Number(deployment.creditBalanceUsd)` — Prisma returns `Decimal` objects, not numbers.
4. **Credit stacking**: Use `prisma.$transaction()` to atomically update `creditBalanceUsd` and create `OpenClawCreditPurchase` record. OpenRouter key limit updated separately (non-critical).
5. **Usage polling cooldown**: 60s cooldown on per-deployment polls prevents excessive OpenRouter API calls. Background poller runs every 5 min for all READY deployments.
6. **OpenRouter key limit**: No `limit_reset` when using credit-based billing — the limit represents total lifetime spending cap, not a periodic reset.

## Open Questions

1. **Install script edge cases** — Does `--no-onboard` fully suppress all interactive prompts? May need `CI=true` or `NONINTERACTIVE=1` as additional env vars. Need to test on a real VPS.
