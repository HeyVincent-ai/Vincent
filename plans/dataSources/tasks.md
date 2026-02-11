# Data Sources - Implementation Tasks

## Phase 1: Core Infrastructure

### Task 1.1: Database Schema Changes
- Add `DATA_SOURCES` to `SecretType` enum in `prisma/schema.prisma`
- Add `dataSourceCreditUsd` field (Decimal(10,2), default 10.00) to `User` model
- Create `DataSourceUsage` model: id, userId, secretId, apiKeyId (nullable), dataSource, endpoint, costUsd (Decimal(10,6)), requestMetadata (Json?), createdAt
- Create `DataSourceCreditPurchase` model: id, userId, amountUsd (Decimal(10,2)), stripePaymentIntentId (unique), createdAt
- Add relations: DataSourceUsage → User, DataSourceUsage → Secret, DataSourceCreditPurchase → User
- Add `dataSourceUsage` and `dataSourceCreditPurchases` relation fields on User
- Add `dataSourceUsage` relation field on Secret
- Run `npx prisma migrate dev`
- **Files:** `prisma/schema.prisma`

### Task 1.2: Handle DATA_SOURCES in Secret Creation
- Update `createSecret()` in `secret.service.ts` to handle `DATA_SOURCES` type
- For `DATA_SOURCES`: set `value` to `null`, no wallet metadata, no key generation
- Just creates the secret record + claim token + API key (like existing types but simpler)
- **Files:** `src/services/secret.service.ts`

### Task 1.3: Data Source Registry
- Create `src/dataSources/registry.ts` with typed `DataSourceConfig` interface
- Define Twitter config: id="twitter", endpoints: search ($0.01), get-tweet ($0.005), get-user ($0.005), user-tweets ($0.01)
- Define Brave Search config: id="brave", endpoints: web ($0.005), news ($0.005)
- Export `getDataSource(id)`, `getAllDataSources()`, `getEndpointCost(dataSourceId, endpoint)` helpers
- **Files:** `src/dataSources/registry.ts`

### Task 1.4: Data Source Guard Middleware
- Create `src/dataSources/middleware.ts`
- Middleware runs AFTER existing `apiKeyAuthMiddleware` (so `req.secret` and `req.apiKey` are available)
- Checks:
  1. `req.secret.type === 'DATA_SOURCES'` — return 403 if wrong type
  2. `req.secret.userId !== null` — return 403 "Secret not claimed. Visit {claimUrl} to claim and activate."
  3. Look up user. Check user has Stripe payment method OR `dataSourceCreditUsd > 0` — return 402 "Credit card required"
  4. (Per-request credit check is done in proxy middleware, not here — this is the "can you use data sources at all" gate)
- Attach `req.dataSourceUser` to the request (the User record) for downstream use
- **Files:** `src/dataSources/middleware.ts`

### Task 1.5: Credit & Usage Service
- Create `src/dataSources/credit.service.ts`:
  - `checkCredit(userId, costUsd)` — returns boolean
  - `deductCredit(userId, costUsd)` — atomic Prisma transaction: read balance, check >= cost, decrement. Throws 402 on insufficient.
  - `getBalance(userId)` — returns Decimal
  - `addCredits(userId, amountUsd, stripePaymentIntentId)` — increment balance + create DataSourceCreditPurchase
  - `getCreditPurchases(userId)` — list purchases
- Create `src/dataSources/usage.service.ts`:
  - `logUsage(params: { userId, secretId, apiKeyId?, dataSource, endpoint, costUsd, metadata? })` — create DataSourceUsage record
  - `getUsageSummary(userId)` — current month aggregate by data source
  - `getUsageHistory(userId)` — monthly totals
  - `getUsageBySecret(secretId)` — usage for a specific DATA_SOURCES secret
- **Files:** `src/dataSources/credit.service.ts`, `src/dataSources/usage.service.ts`

### Task 1.6: Proxy Wrapper
- Create `src/dataSources/proxy.ts`
- `wrapProxy(dataSourceId, endpointId, handlerFn)` — returns an Express handler that:
  1. Gets endpoint cost from registry
  2. Checks credit via `checkCredit(req.dataSourceUser.id, cost)`
  3. If insufficient → 402 with `{ error, balance, required }`
  4. Calls `handlerFn(req, res)` which does the upstream call and returns the response body
  5. On success: `deductCredit()`, `logUsage()`, add `_vincent: { cost, balance }` to response
  6. On upstream error: do NOT deduct, return upstream error
- **Files:** `src/dataSources/proxy.ts`

### Task 1.7: Management API Endpoints
- Create `src/api/routes/dataSourceManagement.routes.ts` (session auth + secret ownership)
- `GET /api/secrets/:secretId/data-sources` — list all data sources from registry + current month usage per source
- `GET /api/secrets/:secretId/data-sources/credits` — balance + recent purchases
- `POST /api/secrets/:secretId/data-sources/credits` — add credits (reuse `chargeCustomerOffSession` from stripe.service.ts, $5-$500 range, handle 3D Secure)
- `GET /api/secrets/:secretId/data-sources/usage` — usage breakdown by source and month
- Mount in `src/api/routes/index.ts` under secrets routes
- **Files:** `src/api/routes/dataSourceManagement.routes.ts`, `src/api/routes/index.ts`

### Task 1.8: Environment Variables
- Add `TWITTER_BEARER_TOKEN` (optional string) to `src/utils/env.ts` Zod schema
- Add `BRAVE_SEARCH_API_KEY` (optional string) to `src/utils/env.ts` Zod schema
- **Files:** `src/utils/env.ts`

---

## Phase 2: Twitter / X.com Data Source

### Task 2.1: Twitter Proxy Handler
- Create `src/dataSources/twitter/handler.ts`
- Implement functions using X API v2 (all use `TWITTER_BEARER_TOKEN` for auth):
  - `searchTweets(query, options)` → `GET https://api.twitter.com/2/tweets/search/recent`
    - Params: query, max_results (10-100), start_time, end_time
    - Default fields: text, created_at, author_id, public_metrics
    - Default expansions: author_id
  - `getTweet(tweetId)` → `GET https://api.twitter.com/2/tweets/:id`
  - `getUserByUsername(username)` → `GET https://api.twitter.com/2/users/by/username/:username`
    - Fields: description, public_metrics, profile_image_url, verified
  - `getUserTweets(userId, options)` → `GET https://api.twitter.com/2/users/:id/tweets`
- Return 503 if `TWITTER_BEARER_TOKEN` not configured
- Validate all inputs with Zod before forwarding
- **Files:** `src/dataSources/twitter/handler.ts`

### Task 2.2: Twitter Routes
- Create `src/dataSources/twitter/routes.ts`
- All routes use: `apiKeyAuthMiddleware` → `dataSourceGuard` → `wrapProxy()`
- Endpoints:
  - `GET /api/data-sources/twitter/search` — q (required), max_results, start_time, end_time
  - `GET /api/data-sources/twitter/tweets/:tweetId`
  - `GET /api/data-sources/twitter/users/:username`
  - `GET /api/data-sources/twitter/users/:userId/tweets` — max_results
- Per-API-key rate limit: 60 req/min
- Register in main data sources router
- Mount data sources router in `src/api/routes/index.ts` at `/data-sources`
- **Files:** `src/dataSources/twitter/routes.ts`, `src/dataSources/router.ts`, `src/api/routes/index.ts`

### Task 2.3: Twitter OpenClaw Skill
- Create clawhub skill package `vincent-twitter` (in `/skills/twitter/` or separate repo)
- Skill checks for pre-provisioned API key in credential file, falls back to self-provisioning via `POST /api/secrets`
- Exposes functions:
  - `search_twitter(query, max_results?)` → calls `/api/data-sources/twitter/search`
  - `get_tweet(tweet_id)` → calls `/api/data-sources/twitter/tweets/:id`
  - `get_twitter_user(username)` → calls `/api/data-sources/twitter/users/:username`
  - `get_user_tweets(user_id, max_results?)` → calls `/api/data-sources/twitter/users/:id/tweets`
- Clear error messages for: unclaimed secret (402), insufficient credits (402), rate limited (429)
- Publish to clawhub
- **Files:** `/skills/twitter/`

---

## Phase 3: Brave Search Data Source

### Task 3.1: Brave Search Proxy Handler
- Create `src/dataSources/brave/handler.ts`
- Implement functions:
  - `webSearch(query, options)` → `GET https://api.search.brave.com/res/v1/web/search`
    - Params: q, count (default 10, max 20), offset, freshness, country
    - Auth header: `X-Subscription-Token: ${BRAVE_SEARCH_API_KEY}`
  - `newsSearch(query, options)` → `GET https://api.search.brave.com/res/v1/news/search`
    - Params: q, count, freshness
- Return 503 if `BRAVE_SEARCH_API_KEY` not configured
- Validate inputs with Zod
- **Files:** `src/dataSources/brave/handler.ts`

### Task 3.2: Brave Search Routes
- Create `src/dataSources/brave/routes.ts`
- All routes use: `apiKeyAuthMiddleware` → `dataSourceGuard` → `wrapProxy()`
- Endpoints:
  - `GET /api/data-sources/brave/web` — q (required), count, offset, freshness
  - `GET /api/data-sources/brave/news` — q (required), count, freshness
- Per-API-key rate limit: 60 req/min
- Register in data sources router
- **Files:** `src/dataSources/brave/routes.ts`, `src/dataSources/router.ts`

### Task 3.3: Brave Search OpenClaw Skill
- Create clawhub skill package `vincent-brave-search` (in `/skills/brave-search/` or separate repo)
- Same credential pattern as Twitter skill (pre-provisioned or self-provisioning)
- Exposes functions:
  - `web_search(query, count?, freshness?)` → calls `/api/data-sources/brave/web`
  - `news_search(query, count?, freshness?)` → calls `/api/data-sources/brave/news`
- Publish to clawhub
- **Files:** `/skills/brave-search/`

---

## Phase 4: Frontend

### Task 4.1: API Client Functions
- Add to `frontend/src/api.ts`:
  - `getDataSourceInfo(secretId)` — `GET /api/secrets/:id/data-sources`
  - `getDataSourceCredits(secretId)` — `GET /api/secrets/:id/data-sources/credits`
  - `addDataSourceCredits(secretId, amount)` — `POST /api/secrets/:id/data-sources/credits`
  - `getDataSourceUsage(secretId)` — `GET /api/secrets/:id/data-sources/usage`
- Define TypeScript interfaces for responses
- **Files:** `frontend/src/api.ts`

### Task 4.2: DataSourcesView Component
- Create `frontend/src/components/DataSourcesView.tsx`
- Shown on SecretDetail page when `secret.type === 'DATA_SOURCES'`
- **Credit Balance Section:**
  - Balance display with progress bar (color: green >$5, yellow $2-$5, red <$2)
  - "Add Credits" button → modal (amount input $5-$500, Stripe off-session, 3DS handling)
- **Available Data Sources:**
  - Card per source from registry: name, description, pricing range, status badge
  - Current month stats: request count, total cost
- **Usage History:**
  - Monthly breakdown table (month, requests, cost)
- **Files:** `frontend/src/components/DataSourcesView.tsx`

### Task 4.3: Integrate into SecretDetail Page
- In `SecretDetail.tsx`, detect `DATA_SOURCES` secret type
- Render `DataSourcesView` component (instead of wallet balance, etc.)
- Existing API Keys and Audit Logs tabs remain
- Add "Data Sources" type badge on Dashboard for this secret type
- **Files:** `frontend/src/pages/SecretDetail.tsx`, `frontend/src/pages/Dashboard.tsx`

---

## Phase 5: OpenClaw Pre-provisioned Secrets

### Task 5.1: Pre-create Secrets During Provisioning
- In `openclaw.service.ts`, add a new provision stage `secrets_created` (after `ssh_key_generated`, before `setup_script_launched`)
- In this stage:
  1. Call `secretService.createSecret({ type: 'DATA_SOURCES', memo: 'OpenClaw Data Sources' })` → get secretId, apiKey, claimToken
  2. Call `secretService.claimSecret({ secretId, claimToken, userId: deployment.userId })` → auto-claim to deploying user
  3. Repeat for `EVM_WALLET` and `POLYMARKET_WALLET`
  4. Store all three API keys in provisioning context
- Store the created secret IDs on the deployment record (new field `vincentSecretIds` Json? on OpenClawDeployment, or a new join table)
- Handle idempotency: if stage is re-run, skip if secrets already exist for this deployment
- **Files:** `src/services/openclaw.service.ts`, `prisma/schema.prisma` (if adding field to deployment)

### Task 5.2: Pass API Keys to Setup Script
- Update `buildSetupScript()` signature to accept `vincentApiKeys: { dataSourcesKey, walletKey, polymarketKey }`
- After skill installation step, write credential files:
  ```bash
  mkdir -p /root/.openclaw/credentials/agentwallet
  echo '{"apiKey":"<key>","host":"https://heyvincent.ai"}' > /root/.openclaw/credentials/agentwallet/default.json
  # Same for vincentpolymarket and vincentdata
  ```
- Update callers of `buildSetupScript()` to pass the new keys (both in `provisionAsync` and `reprovision`)
- **Files:** `src/services/openclaw.service.ts`

### Task 5.3: Install Data Source Skills in Setup Script
- Add to `buildSetupScript()` after existing skill installs:
  ```bash
  npx --yes clawhub@latest install vincent-twitter || true
  npx --yes clawhub@latest install vincent-brave-search || true
  ```
- **Files:** `src/services/openclaw.service.ts`

### Task 5.4: Handle Reprovision & Destroy
- On **reprovision**: re-create secrets if they don't exist, or reuse existing ones. Pass same API keys to new setup script.
- On **destroy**: optionally soft-delete the pre-created secrets (or leave them — user still owns them). At minimum, revoke the API keys that were installed on the VPS.
- **Files:** `src/services/openclaw.service.ts`

### Task 5.5: Frontend — Show Pre-provisioned Secrets on OpenClaw Detail
- On the OpenClaw deployment detail page, show links to the pre-provisioned secrets
- "Your agent has these Vincent accounts pre-configured:" with links to each secret detail page
- Query secrets by the stored IDs on the deployment record
- **Files:** `frontend/src/pages/OpenClawDetail.tsx`, `frontend/src/api.ts`

---

## Phase 6: Testing & Polish

### Task 6.1: Backend Tests
- Test DATA_SOURCES secret creation (value is null, claim works)
- Test data source guard middleware (unclaimed → 403, no card → 402, valid → pass)
- Test credit check/deduct (sufficient, insufficient, concurrent, atomic)
- Test proxy wrapper (success → deduct + log, upstream error → no deduct)
- Test management endpoints (list, credits, usage)
- Test pre-provisioning flow (create + claim + keys)
- **Files:** `src/__tests__/dataSources/` or `src/dataSources/__tests__/`

### Task 6.2: Rate Limiting
- Per-API-key rate limiting on data source proxy routes
- Use express-rate-limit, key by API key ID (from `req.apiKey.id`)
- 60 req/min default, configurable per data source in registry
- Return 429 with Retry-After header
- **Files:** `src/dataSources/router.ts` or `src/dataSources/middleware.ts`

### Task 6.3: Audit Logging Integration
- Log all data source proxy requests to AuditLog (fire-and-forget, like other skills)
- Action types: `datasource.twitter.search`, `datasource.brave.web`, etc.
- Include: query params, cost, balance after, upstream response status
- **Files:** `src/dataSources/proxy.ts`

### Task 6.4: Error Handling
- Graceful upstream API error handling (timeouts, 429s, 500s from Twitter/Brave)
- Clear error messages for all failure modes:
  - 503 if upstream API not configured (missing env var)
  - 402 if insufficient credits (include balance + cost + link to add credits)
  - 403 if secret not claimed (include claim URL)
  - 429 if rate limited (include retry-after)
- **Files:** Various

---

## Implementation Order

```
Phase 1 (Core Infrastructure) — foundation, must be first
  ├── 1.1 Schema
  ├── 1.2 Secret creation handler  (needs 1.1)
  ├── 1.3 Registry                 (no deps)
  ├── 1.4 Guard middleware          (needs 1.1)
  ├── 1.5 Credit/usage services    (needs 1.1)
  ├── 1.6 Proxy wrapper            (needs 1.3, 1.4, 1.5)
  ├── 1.7 Management API           (needs 1.5)
  └── 1.8 Env vars                 (no deps)

Phase 2 (Twitter) — needs Phase 1 complete
  ├── 2.1 Handler
  ├── 2.2 Routes                   (needs 2.1)
  └── 2.3 Clawhub skill            (needs 2.2 deployed)

Phase 3 (Brave) — needs Phase 1 complete, parallel with Phase 2
  ├── 3.1 Handler
  ├── 3.2 Routes                   (needs 3.1)
  └── 3.3 Clawhub skill            (needs 3.2 deployed)

Phase 4 (Frontend) — needs Phase 1.7 complete
  ├── 4.1 API client functions
  ├── 4.2 DataSourcesView          (needs 4.1)
  └── 4.3 SecretDetail integration (needs 4.2)

Phase 5 (Pre-provisioning) — needs Phase 2+3 complete (skills must exist to install)
  ├── 5.1 Pre-create secrets       (needs 1.2)
  ├── 5.2 Pass keys to setup       (needs 5.1)
  ├── 5.3 Install data source skills
  ├── 5.4 Reprovision/destroy
  └── 5.5 Frontend links

Phase 6 (Testing & Polish) — ongoing, final pass after all phases
```

### Estimated Scope
- **Phase 1:** ~10 files created/modified
- **Phase 2:** ~3 files created, 1 modified
- **Phase 3:** ~3 files created, 1 modified
- **Phase 4:** ~3 files created/modified
- **Phase 5:** ~3 files modified
- **Phase 6:** ~5 files created/modified
- **Total:** ~25-30 files
