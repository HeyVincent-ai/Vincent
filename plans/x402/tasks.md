# x402 Skill - Implementation Tasks

## Phase 1: Core Skill (MVP)

### Database & Schema
- [ ] Add `X402_SERVICE_ALLOWLIST` and `X402_SPENDING_LIMIT` to `PolicyType` enum in `prisma/schema.prisma`
- [ ] Create and run Prisma migration
- [ ] Verify migration works on fresh DB and existing DB with data

### Dependencies
- [ ] Install `@x402/fetch`, `@x402/evm`, `@x402/core`
- [ ] Verify packages work with our Node 20+ / ES2022 / NodeNext setup
- [ ] Add `X402_DEFAULT_NETWORK`, `X402_FACILITATOR_URL`, `X402_BAZAAR_URL` to `src/utils/env.ts` (all optional)

### Skill Service (`src/skills/x402.service.ts`)
- [ ] Implement `getWalletData()` helper (reuse pattern from `evmWallet.service.ts`)
- [ ] Implement `createX402Fetch()` helper (wraps `@x402/fetch` with wallet signer via `privateKeyToAccount`)
- [ ] Implement `executeFetch()` — policy check → tx log → x402 fetch → extract cost → log result
- [ ] Implement `discoverServices()` — query Bazaar discovery API with filtering
- [ ] Implement `getSpending()` — x402 spending summary from TransactionLog (no wallet balance — that's in the existing evm-wallet endpoint)
- [ ] Implement `getHistory()` — paginated query of x402 TransactionLog entries
- [ ] Implement `extractCostFromResponse()` — parse PAYMENT-RESPONSE header for settlement cost
- [ ] Handle error cases: insufficient USDC, service unreachable, invalid URL, non-x402 endpoint

### Routes (`src/api/routes/x402.routes.ts`)
- [ ] Create router with `apiKeyAuthMiddleware`
- [ ] `POST /fetch` — Zod schema + handler calling `executeFetch()` + audit log
- [ ] `GET /discover` — query params + handler calling `discoverServices()`
- [ ] `GET /spending` — handler calling `getSpending()`
- [ ] `GET /history` — query params + handler calling `getHistory()`

### Route Registration
- [ ] Import and mount x402 router in `src/api/routes/index.ts`
- [ ] Export x402 service in `src/skills/index.ts`

### Policy Engine Updates
- [ ] Add `X402ServiceAllowlistConfig` type to `src/services/policy.service.ts`
- [ ] Add `X402SpendingLimitConfig` type to `src/services/policy.service.ts`
- [ ] Add policy config validation for new types in policy creation/update endpoints
- [ ] Add `x402_fetch` to `PolicyCheckAction.type` union in `src/policies/checker.ts`
- [ ] Add `x402Url`, `x402Domain`, `x402EstimatedCost` optional fields to `PolicyCheckAction`
- [ ] Implement `X402_SERVICE_ALLOWLIST` evaluation — domain matching against config.domains
- [ ] Implement `X402_SPENDING_LIMIT` evaluation — per-call max, rolling daily/weekly from TransactionLog
- [ ] Skip irrelevant policies (`ADDRESS_ALLOWLIST`, `TOKEN_ALLOWLIST`, etc.) for `x402_fetch` actions
- [ ] Keep `REQUIRE_APPROVAL` working for x402 actions
- [ ] Unit tests for all x402 policy evaluation branches

### SKILL.md (`skills/x402/SKILL.md`)
- [ ] Write frontmatter (name, description, homepage, source, metadata)
- [ ] Security model section (x402 payments use existing wallet, never expose keys)
- [ ] Discover → Fetch → Balance workflow with curl examples
- [ ] Example for each major category: data (CoinGecko), search (Exa), LLM (OpenRouter), parsing (Reducto)
- [ ] Policy behavior documentation
- [ ] Funding instructions (send USDC on Base to wallet address)
- [ ] Re-link and API key usage (same as wallet skill)

### Frontend — Wallet Detail: x402 Services Tab
- [ ] Add "x402 Services" to `getTabsForType()` in `SecretDetail.tsx` for `EVM_WALLET` secrets
- [ ] Create `X402ServicesTab.tsx` — the full tab component with three sections
- [ ] Section A: x402 Spending Stats — today/week/all-time spend + call counts (NOT wallet balance — that's in Overview tab)
- [ ] Section A (no activity): hint to browse catalog and ensure wallet has USDC on Base via Overview tab
- [ ] Section B: Service catalog grid — fetch from `GET /api/skills/x402/discover`, cache client-side
- [ ] Create `X402ServiceCatalog.tsx` — service cards grouped by category
- [ ] Each card: name, category badge, description, endpoint count, price, docs link
- [ ] Search input + max price filter for catalog
- [ ] Section C: Recent activity — last 10 x402 calls from `GET /api/skills/x402/history?limit=10`
- [ ] Each row: status dot, service name, endpoint path, cost, relative time
- [ ] "View all in Audit Logs" link

### Frontend — Policy Manager
- [ ] Add `X402_SERVICE_ALLOWLIST` to `POLICY_TYPES` array with `isArray: true`, `configKey: 'domains'`
- [ ] Add `X402_SPENDING_LIMIT` to `POLICY_TYPES` with custom form (three optional number fields)
- [ ] Build custom form for x402 Spending Limit: max per call, max per day, max per week (all optional USD)
- [ ] Add approval override checkbox for both x402 policy types

### Frontend — Skills Page (minimal)
- [ ] Add "x402 Payments" pill to EVM Wallet Features section
- [ ] Add "x402 HTTP Payments ● live" pill to Connectors section with tooltip

### Frontend — API Client (`api.ts`)
- [ ] Add `getX402Spending(secretId)` function
- [ ] Add `getX402History(secretId, params)` function
- [ ] Add `getX402Services(params)` function

### Testing
- [ ] Unit tests: domain extraction, cost parsing, Bazaar response formatting
- [ ] Unit tests: X402_SERVICE_ALLOWLIST policy evaluation (match, no match, approvalOverride)
- [ ] Unit tests: X402_SPENDING_LIMIT policy evaluation (per-call, daily rolling, weekly rolling)
- [ ] E2E test: create wallet → discover services → fetch x402 endpoint (Base Sepolia)
- [ ] E2E test: policy denial (allowlist blocks unlisted domain)
- [ ] E2E test: spending limit enforcement (exceed per-call max)
- [ ] E2E test: spending and history endpoints return correct data
- [ ] Skill CI test: agent reads SKILL.md, discovers services, checks spending, makes x402 call

### Documentation
- [ ] Update README.md with x402 skill section
- [ ] Add x402 endpoints to API docs (Scalar/OpenAPI)

## Phase 2: Enhanced Discovery & UX

### Catalog Enrichment
- [ ] Curated service metadata (better descriptions, input/output schemas, categories)
- [ ] Service card expansion on click — endpoint list, example requests, pricing breakdown

### Dashboard
- [ ] x402 badge on wallet cards when USDC on Base > 0
- [ ] x402 spending summary in dashboard Overview Card

### Notifications
- [ ] Telegram notification for x402 spending milestones ($1, $5, $10/day)
- [ ] Low balance warning when USDC on Base drops below $1

### Marketing Pages
- [ ] Landing page: capability card, hero carousel scenario, FAQ entry
- [ ] Features page: x402 section with architecture diagram

## Phase 3: Smart Routing (Future)

- [ ] Semantic intent → service mapping (agent says "search for X" → auto-pick best search service)
- [ ] Cost optimization across equivalent services
- [ ] Fallback/retry across alternative services
- [ ] Service health monitoring and availability tracking
