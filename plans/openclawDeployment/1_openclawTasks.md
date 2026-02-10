# OpenClaw 1-Click Deploy — Task Tracker

## Phase 1: Backend Foundation ✅ COMPLETE

- [x] **1.1** Add `ovh` and `ssh2` packages (`@ovhcloud/node-ovh@^3.0.0`, `ssh2@^1.17.0`, `@types/ssh2`)
- [x] **1.2** Create Prisma model `OpenClawDeployment` with `OpenClawStatus` enum (schema + migration `20260206022505_add_openclaw_deployment`)
- [x] **1.3** Add relation to `User` model (`openclawDeployments OpenClawDeployment[]`)
- [x] **1.4** Implement `src/services/ovh.service.ts` — full OVH API client (orderVps, listVps, getVpsDetails, getVpsIps, rebuildVps, terminateVps, addSshKey, deleteSshKey, listSshKeys, getAvailableDatacenters, findAvailableDatacenter, getCartDatacenters, getAvailableImages, getImageDetails, getAvailableOs, getAccountInfo, rebootVps, getOrderStatus, getOrderAssociatedService)
- [x] **1.5** Implement `src/services/openrouter.service.ts` — OpenRouter key management (createKey, deleteKey, getKeyUsage)
- [x] **1.6** Implement `src/services/openclaw.service.ts` — full deploy orchestration (deploy, getDeployment, listDeployments, destroy, restart, plus internal: provisionAsync, generateSshKeyPair, sshExec, waitForSsh, buildSetupScript, waitForHealth, findAvailablePlanAndDc, pollForDelivery, pollForIp, findRebuildImage, waitForRebuild)
- [x] **1.7** Implement `src/api/routes/openclaw.routes.ts` — all 5 API endpoints (POST /deploy, GET /deployments, GET /deployments/:id, DELETE /deployments/:id, POST /deployments/:id/restart)
- [x] **1.8** Mount routes in `src/api/routes/index.ts` (`router.use('/openclaw', openclawRouter)`)
- [x] **1.9** Export service from `src/services/index.ts`

## Phase 2: Frontend ✅ COMPLETE

- [x] **2.1** Add OpenClaw API functions to `frontend/src/api.ts` (deployOpenClaw, getOpenClawDeployments, getOpenClawDeployment, destroyOpenClawDeployment, restartOpenClawDeployment)
- [x] **2.2** Build `frontend/src/components/OpenClawSection.tsx` — dashboard card with deploy button, progress stepper, polling, ready/error states
- [x] **2.3** Build `frontend/src/pages/OpenClawDetail.tsx` — instance management page with iframe (`https://<vps-ip>?token=...`), status badge, restart/destroy with confirmation
- [x] **2.4** Add route in `frontend/src/App.tsx` (`/openclaw/:id` → `<OpenClawDetail />` inside `<ProtectedRoute>`)
- [x] **2.5** Add OpenClaw section to Dashboard page (`frontend/src/pages/Dashboard.tsx`) via `<OpenClawSection />` component
- [x] **2.6** Add nav link in Layout (`/dashboard#openclaw`)

## Phase 3: Infrastructure & E2E Testing ✅ COMPLETE

- [x] **3.1** Write E2E test for backend services (`src/e2e/openclaw.e2e.test.ts`) — tests OVH API connectivity, VPS listing, datacenter availability, OS choices, SSH keys, OpenRouter key provisioning, cart creation, and real VPS order+rebuild+SSH verification
- [x] **3.2** Write E2E test for API endpoints (`src/e2e/openclaw-api.e2e.test.ts`) — tests deployment CRUD, auth, user isolation, polling lifecycle, and destroy via HTTP API with mocked auth
- [x] **3.3** VPS setup script tested on real OVH VPS (build script embedded in openclaw.service.ts)

## Phase 4: Billing ($25/mo per deployment) ✅ COMPLETE

- [x] **4.1** Add `STRIPE_OPENCLAW_PRICE_ID` to env schema (`src/utils/env.ts`)
- [x] **4.2** Prisma migration `20260206_add_openclaw_billing`: add `stripeSubscriptionId` (String? @unique), `currentPeriodEnd` (DateTime?), `canceledAt` (DateTime?) to `OpenClawDeployment`; add `PENDING_PAYMENT` and `CANCELING` to `OpenClawStatus` enum
- [x] **4.3** Update `openclaw.service.ts` deploy flow — `deploy()` now creates Stripe Checkout session with `STRIPE_OPENCLAW_PRICE_ID` + deployment metadata, returns `{ deployment, checkoutUrl }`; new `startProvisioning()` method triggered by webhook
- [x] **4.4** Add OpenClaw webhook handlers in `stripe.service.ts` — `checkout.session.completed` (match by metadata.type === 'openclaw' → call `startProvisioning`), `customer.subscription.deleted` (match by stripeSubscriptionId → call `handleSubscriptionExpired`), `invoice.payment_failed` (update statusMessage on deployment)
- [x] **4.5** Add `POST /api/openclaw/deployments/:id/cancel` route — calls Stripe `cancel_at_period_end: true`, sets deployment status to `CANCELING` with `canceledAt` timestamp, returns `currentPeriodEnd`
- [x] **4.6** Update `DELETE /api/openclaw/deployments/:id` — `destroy()` now also cancels Stripe subscription immediately before terminating VPS
- [x] **4.7** Update frontend deploy flow — `deployOpenClaw(successUrl, cancelUrl)` returns `{ deploymentId, checkoutUrl }`, frontend redirects to Stripe Checkout, handles return via `openclaw_deploy` + `openclaw_deployment_id` query params
- [x] **4.8** Update frontend cancel flow — "Cancel" button on detail page triggers cancel confirmation dialog, shows "Active until [date]" for CANCELING status, "Destroy Now" option for immediate teardown
- [x] **4.9** Update `OpenClawSection.tsx` — shows "$25/mo" on deploy button, added PENDING_PAYMENT step to progress, CANCELING status with period end date, `id="openclaw"` anchor
- [x] **4.10** E2E test `src/e2e/openclaw-billing.e2e.test.ts` — 9 tests covering: checkout session creation (PENDING_PAYMENT), startProvisioning transition, billing fields in API response, cancel at period end (CANCELING + Stripe cancel_at_period_end), restart allowed while CANCELING, subscription expiry → destroy, immediate destroy cancels Stripe sub, validation of required URLs

## Phase 5: Token Billing (LLM credit system) ✅ COMPLETE

- [x] **5.1** Prisma migration `20260206213951_add_openclaw_credit_billing`: add `creditBalanceUsd` (Decimal(10,2), default 25.00), `lastKnownUsageUsd` (Decimal(10,2), default 0), `lastUsagePollAt` (DateTime?) to `OpenClawDeployment`; add new `OpenClawCreditPurchase` model (id, deploymentId, amountUsd, stripePaymentIntentId, createdAt)
- [x] **5.2** Add `updateKeyLimit(hash, newLimit)` to `openrouter.service.ts` — PATCH `/api/v1/keys/:hash` to update spending limit; expanded `getKeyUsage()` return to include `usage_daily`, `usage_weekly`, `usage_monthly`
- [x] **5.3** Update deploy flow in `openclaw.service.ts` — create OpenRouter key with `limit: 25` ($25 free credits); `creditBalanceUsd` defaults to 25.00 via Prisma schema
- [x] **5.4** Add `getUsage()` method to `openclaw.service.ts` — polls OpenRouter `getKeyUsage()` if last poll > 60s ago, caches `lastKnownUsageUsd` + `lastUsagePollAt` in DB, returns usage breakdown + remaining credits
- [x] **5.5** Add `addCredits()` method to `openclaw.service.ts` — validates $5-$500, calls `chargeCustomerOffSession()`, on success: increments `creditBalanceUsd` in transaction with `OpenClawCreditPurchase` record, calls `updateKeyLimit()` with new total; handles 3D Secure (`requiresAction` + `clientSecret`)
- [x] **5.6** Add `chargeCustomerOffSession(userId, amountCents, description, metadata)` to `stripe.service.ts` — gets customer's default payment method from `customer.invoice_settings.default_payment_method`, creates PaymentIntent with `off_session: true, confirm: true`, handles `authentication_required` error (returns `clientSecret` for 3D Secure)
- [x] **5.7** Add `GET /api/openclaw/deployments/:id/usage` route — returns `{ creditBalanceUsd, totalUsageUsd, remainingUsd, usageDailyUsd, usageMonthlyUsd, lastPolledAt }`
- [x] **5.8** Add `POST /api/openclaw/deployments/:id/credits` route — body `{ amountUsd }`, zod-validated ($5-$500), returns `{ success, newBalanceUsd, paymentIntentId }` or `{ requiresAction, clientSecret }` for 3D Secure
- [x] **5.9** Update frontend `OpenClawDetail.tsx` — usage card with progress bar (used/remaining), daily/monthly stats, "Add Credits" button → modal with amount input → calls `addOpenClawCredits()` → refreshes usage on success; "Credits exhausted" warning when remaining ≤ $0
- [x] **5.10** Update frontend `OpenClawSection.tsx` dashboard card — credit balance progress bar + summary text for READY/CANCELING deployments, "Credits exhausted" warning
- [x] **5.11** Add frontend API functions: `getOpenClawUsage(id)`, `addOpenClawCredits(id, amountUsd)` in `frontend/src/api.ts`
- [x] **5.12** Add background usage poller in `openclaw.service.ts` — `startUsagePoller()` / `stopUsagePoller()` (every 5 min), polls all READY deployments with OpenRouter keys, updates `lastKnownUsageUsd`; wired into `src/index.ts` startup/shutdown
- [x] **5.13** E2E test `src/e2e/openclaw-credits.e2e.test.ts` — 7 tests: $25 default credits, usage API, 404 handling, amount validation ($5-$500), Stripe off-session charge + DB update + CreditPurchase record + PaymentIntent verification, credit stacking, updated balance in usage endpoint

## Phase 6: Hardening ✅ COMPLETE

- [x] **6.1** Add error recovery — `retryDeploy()` in openclaw.service.ts (cleans up partial OpenRouter key, resets deployment state, re-provisions from scratch using existing subscription); `cleanupOrphanedResources()` revokes OpenRouter keys on DESTROYED deployments and marks abandoned PENDING_PAYMENT checkouts (>24h) as DESTROYED; `POST /api/openclaw/deployments/:id/retry` route; frontend retry buttons in OpenClawSection.tsx and OpenClawDetail.tsx (uses retry API for paid deployments, deploy-again for unpaid)
- [x] **6.2** Add deployment timeout handling — `checkStaleDeployments()` runs every 5 min; PENDING_PAYMENT > 1h → ERROR; PENDING/ORDERING > 20 min → ERROR; PROVISIONING/INSTALLING > 30 min → ERROR
- [x] **6.3** Add monitoring / health checks — `checkDeploymentHealth()` pings READY/CANCELING deployments via hostname HTTPS and fallback direct IP:18789; tracks consecutive failures in memory; after 3 failures, updates statusMessage to warn; auto-recovers when instance comes back
- [x] **6.4** Add rate limiting on deploy endpoint — per-user in-memory: 1 deploy per minute, max 3 active (non-DESTROYED, non-ERROR) deployments per user; returns 429 with descriptive error
- [x] **6.5** Unified hardening background worker — `startHardeningWorker()` / `stopHardeningWorker()` runs every 5 min (timeout checks → orphan cleanup → health monitoring); wired into src/index.ts startup/shutdown alongside usage poller

## Phase 7: Frontend and Landing Page Cleanup

- [ ] **7.1** Integrate cofounder's new landing page design
- [ ] **7.2** General frontend cleanup and polish
