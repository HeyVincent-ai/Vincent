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

## Phase 4: Billing ($25/mo per deployment)

- [ ] **4.1** Add `STRIPE_OPENCLAW_PRICE_ID` to env schema (`src/utils/env.ts`)
- [ ] **4.2** Prisma migration: add `stripeSubscriptionId` (String? @unique), `currentPeriodEnd` (DateTime?), `canceledAt` (DateTime?) to `OpenClawDeployment`; add `PENDING_PAYMENT` and `CANCELING` to `OpenClawStatus` enum
- [ ] **4.3** Update `openclaw.service.ts` deploy flow — create Stripe Checkout session with `STRIPE_OPENCLAW_PRICE_ID` and deployment metadata, return checkout URL; move VPS provisioning into `startProvisioning()` triggered by webhook
- [ ] **4.4** Add OpenClaw webhook handlers in billing routes — `checkout.session.completed` (match by metadata.deploymentId → call `startProvisioning`), `customer.subscription.deleted` (match by stripeSubscriptionId → destroy VPS), `invoice.payment_failed` (mark deployment)
- [ ] **4.5** Add `POST /api/openclaw/deployments/:id/cancel` route — calls Stripe `cancel_at_period_end: true`, sets deployment status to `CANCELING` with `canceledAt` timestamp
- [ ] **4.6** Update `DELETE /api/openclaw/deployments/:id` — also cancel Stripe subscription immediately (not at period end) before destroying VPS
- [ ] **4.7** Update frontend deploy flow — `deployOpenClaw()` now returns `{ deploymentId, checkoutUrl }`, redirect user to Stripe Checkout, handle return via `successUrl` query param, poll deployment status after return
- [ ] **4.8** Update frontend cancel flow — add "Cancel" button (calls cancel endpoint), show "Active until [date]" badge for CANCELING status, add "Destroy Now" option for immediate teardown
- [ ] **4.9** Update `OpenClawSection.tsx` — show "$25/mo" on deploy button, add PENDING_PAYMENT and CANCELING states to progress/status UI
- [ ] **4.10** E2E test: billing flow (checkout session creation, webhook-triggered provisioning, cancel at period end, subscription expiry → VPS destroy)

## Phase 5: Hardening

- [ ] **5.1** Add error recovery — retry failed provisions, cleanup orphaned VPS, revoke orphaned OpenRouter keys
- [ ] **5.2** Add deployment timeout handling — cancel/error after 20 min of no progress
- [ ] **5.3** Add monitoring / health checks for running instances (periodic background checks)
- [ ] **5.4** Add OpenRouter usage tracking + passthrough billing via Stripe
- [ ] **5.5** Add rate limiting on deploy endpoint to prevent abuse
- [ ] **5.6** Add cost tracking per user (VPS + OpenRouter token costs)
