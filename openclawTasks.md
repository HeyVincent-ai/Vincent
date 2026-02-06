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

## Phase 2: Frontend

- [ ] **2.1** Add OpenClaw API functions to `frontend/src/api.ts` (deployOpenClaw, getOpenClawDeployments, getOpenClawDeployment, destroyOpenClawDeployment, restartOpenClawDeployment)
- [ ] **2.2** Build `frontend/src/components/OpenClawSection.tsx` — dashboard card with deploy button, progress view, ready state, error state
- [ ] **2.3** Build `frontend/src/pages/OpenClawDetail.tsx` — instance management page with iframe embedding OpenClaw web UI (`https://<vps-ip>?token=...`), status badge, restart/destroy buttons
- [ ] **2.4** Add route in `frontend/src/App.tsx` (`/openclaw/:id` → `<OpenClawDetail />` inside `<ProtectedRoute>`)
- [ ] **2.5** Add OpenClaw section to Dashboard page (`frontend/src/pages/Dashboard.tsx`)
- [ ] **2.6** Add nav link in Layout (link to OpenClaw section on dashboard or dedicated page)

## Phase 3: Infrastructure & E2E Testing ✅ COMPLETE

- [x] **3.1** Write E2E test for backend services (`src/e2e/openclaw.e2e.test.ts`) — tests OVH API connectivity, VPS listing, datacenter availability, OS choices, SSH keys, OpenRouter key provisioning, cart creation, and real VPS order+rebuild+SSH verification
- [x] **3.2** Write E2E test for API endpoints (`src/e2e/openclaw-api.e2e.test.ts`) — tests deployment CRUD, auth, user isolation, polling lifecycle, and destroy via HTTP API with mocked auth
- [x] **3.3** VPS setup script tested on real OVH VPS (build script embedded in openclaw.service.ts)

## Phase 4: Hardening

- [ ] **4.1** Add error recovery — retry failed provisions, cleanup orphaned VPS, revoke orphaned OpenRouter keys
- [ ] **4.2** Add deployment timeout handling — cancel/error after 20 min of no progress
- [ ] **4.3** Add monitoring / health checks for running instances (periodic background checks)
- [ ] **4.4** Add OpenRouter usage tracking + passthrough billing via Stripe
- [ ] **4.5** Add rate limiting on deploy endpoint to prevent abuse
- [ ] **4.6** Add cost tracking per user (VPS + OpenRouter token costs)
