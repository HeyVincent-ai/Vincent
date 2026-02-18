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
- [ ] Implement `createX402Fetch()` helper (wraps `@x402/fetch` with wallet signer)
- [ ] Implement `executeFetch()` — main action: policy check → tx log → x402 fetch → log result
- [ ] Implement `discoverServices()` — query Bazaar discovery API with filtering
- [ ] Implement `getBalance()` — check USDC balance on Base + spending summary from TransactionLog
- [ ] Implement `getHistory()` — paginated query of x402 TransactionLog entries
- [ ] Handle error cases: insufficient USDC, service unreachable, invalid URL, non-x402 endpoint
- [ ] Extract cost from x402 `PAYMENT-RESPONSE` header after successful fetch

### Routes (`src/api/routes/x402.routes.ts`)
- [ ] Create router with `apiKeyAuthMiddleware`
- [ ] `POST /fetch` — Zod schema + handler calling `executeFetch()`
- [ ] `GET /discover` — Zod query params + handler calling `discoverServices()`
- [ ] `GET /balance` — handler calling `getBalance()`
- [ ] `GET /history` — Zod query params + handler calling `getHistory()`
- [ ] Add audit logging to all endpoints

### Route Registration
- [ ] Import and mount x402 router in `src/api/routes/index.ts`
- [ ] Export x402 service in `src/skills/index.ts`

### Policy Engine Updates
- [ ] Add `X402ServiceAllowlistConfig` type to `src/services/policy.service.ts`
- [ ] Add `X402SpendingLimitConfig` type to `src/services/policy.service.ts`
- [ ] Add policy config validation for new types in policy creation/update endpoints
- [ ] Add `x402_fetch` to `PolicyCheckAction.type` union in `src/policies/checker.ts`
- [ ] Add `x402Url`, `x402Domain`, `x402EstimatedCost` optional fields to `PolicyCheckAction`
- [ ] Implement `X402_SERVICE_ALLOWLIST` evaluation in `checkPolicies()` — domain matching
- [ ] Implement `X402_SPENDING_LIMIT` evaluation in `checkPolicies()` — per-call, daily, weekly
- [ ] Skip irrelevant policies (`ADDRESS_ALLOWLIST`, `TOKEN_ALLOWLIST`, etc.) for `x402_fetch` actions
- [ ] Unit tests for x402 policy evaluation

### SKILL.md
- [ ] Write `skills/x402/SKILL.md` with frontmatter, security model, examples
- [ ] Include discover → fetch → balance workflow
- [ ] Include example for each major service category (data, search, LLM, parsing)
- [ ] Document policy behavior and funding instructions

### Frontend
- [ ] Add x402 policy types to `PolicyManager.tsx` (service allowlist UI, spending limit UI)
- [ ] Add x402 spending summary section to `SecretDetail.tsx` for EVM_WALLET secrets
- [ ] Add x402 to the skills listing in `Skills.tsx`

### Testing
- [ ] Unit tests for domain extraction, cost parsing, policy evaluation
- [ ] E2E test: create wallet → discover → fetch (against testnet x402 endpoint)
- [ ] E2E test: policy denial (allowlist blocks unlisted domain)
- [ ] E2E test: spending limit enforcement
- [ ] Skill CI test: agent reads SKILL.md, discovers services, makes x402 call

### Documentation
- [ ] Update README.md with x402 skill description
- [ ] Add x402 to API docs (Scalar/OpenAPI)

## Phase 2: Enhanced Discovery & UX

- [ ] Build curated service catalog (seed from Bazaar, add categories/descriptions)
- [ ] Create `/api/skills/x402/catalog` endpoint serving curated catalog
- [ ] Frontend "x402 Services" page with service cards, categories, and docs links
- [ ] Dashboard widget showing x402 spend trends chart
- [ ] Telegram notifications for spending milestones (e.g., "Your agent has spent $5 on x402 today")

## Phase 3: Smart Routing (Future)

- [ ] Semantic intent → service mapping
- [ ] Cost optimization across equivalent services
- [ ] Fallback/retry across alternative services
- [ ] Service health monitoring and availability tracking
