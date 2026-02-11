# Data Sources - Implementation Tasks

## Phase 1: Core Infrastructure

### Task 1.1: Database Schema
- Add `dataSourceCreditUsd` field (Decimal, default 10.00) to `User` model in `prisma/schema.prisma`
- Create `DataSourceUsage` model with fields: id, userId, deploymentId (nullable), dataSource, endpoint, costUsd, requestMetadata (Json), createdAt
- Create `DataSourceCreditPurchase` model with fields: id, userId, amountUsd, stripePaymentIntentId (unique), createdAt
- Add relations: DataSourceUsage → User, DataSourceUsage → OpenClawDeployment, DataSourceCreditPurchase → User
- Add `dataSourceUsage` and `dataSourceCreditPurchases` relation fields on User model
- Add `dataSourceUsage` relation field on OpenClawDeployment model
- Run `npx prisma migrate dev` to create migration
- **Files:** `prisma/schema.prisma`

### Task 1.2: Data Source Registry
- Create `src/dataSources/registry.ts` with typed `DataSourceConfig` interface
- Define Twitter and Brave Search configs (id, displayName, description, status, endpoints with pricing)
- Export `getDataSource(id)`, `getAllDataSources()`, `getEndpointCost(dataSourceId, endpoint)` functions
- **Files:** `src/dataSources/registry.ts`

### Task 1.3: Deployment Token Auth Middleware
- Create `src/api/middleware/deploymentAuth.ts`
- Extract Bearer token from Authorization header
- Look up `OpenClawDeployment` where accessToken matches and status is READY or CANCELING
- Look up associated User
- Attach `req.deployment` and `req.user` to request
- Return 401 if token invalid, 403 if deployment not in valid status
- **Files:** `src/api/middleware/deploymentAuth.ts`

### Task 1.4: Credit & Usage Service
- Create `src/dataSources/credit.service.ts`
- `checkCredit(userId, costUsd)` — returns true if user has sufficient balance
- `deductCredit(userId, costUsd)` — atomically deducts from `dataSourceCreditUsd` (use Prisma transaction with a check to prevent going below zero)
- `getBalance(userId)` — returns current credit balance
- `addCredits(userId, amountUsd, stripePaymentIntentId)` — adds to balance, creates DataSourceCreditPurchase record
- `getCreditPurchases(userId)` — lists past credit purchases
- Create `src/dataSources/usage.service.ts`
- `logUsage(userId, deploymentId, dataSource, endpoint, costUsd, metadata?)` — creates DataSourceUsage record
- `getUsageSummary(userId, options?)` — aggregated usage by data source for current month
- `getUsageHistory(userId)` — monthly usage totals
- `getUsageByDeployment(deploymentId)` — usage breakdown for a specific deployment
- **Files:** `src/dataSources/credit.service.ts`, `src/dataSources/usage.service.ts`

### Task 1.5: Data Source Proxy Middleware
- Create `src/dataSources/proxyMiddleware.ts`
- Generic middleware that wraps each proxy handler:
  1. Looks up endpoint cost from registry
  2. Checks credit balance via credit service
  3. If insufficient, returns 402 with `{ error: "Insufficient data source credits", balance, required, addCreditsUrl }`
  4. Calls the actual proxy handler
  5. On success: logs usage, deducts credit, adds `X-DataSource-Cost` and `X-DataSource-Balance` response headers
  6. On upstream error: does NOT deduct credit, returns upstream error to caller
- **Files:** `src/dataSources/proxyMiddleware.ts`

### Task 1.6: Management API Endpoints
- Create `src/api/routes/dataSources.routes.ts` (session-authenticated)
- `GET /api/data-sources` — list all data sources from registry, enriched with user's current month usage stats
- `GET /api/data-sources/credits` — returns credit balance and recent purchases
- `POST /api/data-sources/credits` — add credits via Stripe off-session charge (reuse `chargeCustomerOffSession` from stripe.service.ts)
  - Validate amount ($5-$500)
  - Handle 3D Secure (return `requiresAction` + `clientSecret` if needed)
- `GET /api/data-sources/usage` — current month usage breakdown by data source and endpoint
- `GET /api/data-sources/usage/history` — monthly usage history
- Mount routes in `src/api/routes/index.ts`
- **Files:** `src/api/routes/dataSources.routes.ts`, `src/api/routes/index.ts`

### Task 1.7: Environment Variables
- Add `TWITTER_BEARER_TOKEN` (optional) to `src/utils/env.ts` Zod schema
- Add `BRAVE_SEARCH_API_KEY` (optional) to `src/utils/env.ts` Zod schema
- **Files:** `src/utils/env.ts`

---

## Phase 2: Twitter / X.com Data Source

### Task 2.1: Twitter Proxy Handler
- Create `src/dataSources/twitter/handler.ts`
- Implement proxy functions using X API v2:
  - `searchTweets(query, options)` → `GET https://api.twitter.com/2/tweets/search/recent`
    - Forward: query, max_results, start_time, end_time, tweet.fields, user.fields, expansions
    - Default tweet.fields: text, created_at, author_id, public_metrics
    - Default expansions: author_id (to include user info)
  - `getTweet(tweetId)` → `GET https://api.twitter.com/2/tweets/:id`
    - Include tweet.fields and expansions
  - `getUserByUsername(username)` → `GET https://api.twitter.com/2/users/by/username/:username`
    - Include user.fields: description, public_metrics, profile_image_url, verified
  - `getUserTweets(userId, options)` → `GET https://api.twitter.com/2/users/:id/tweets`
    - Forward: max_results, start_time, end_time, tweet.fields
- Use `TWITTER_BEARER_TOKEN` env var for auth
- Return 503 if `TWITTER_BEARER_TOKEN` not configured
- Validate and sanitize all inputs before forwarding
- **Files:** `src/dataSources/twitter/handler.ts`

### Task 2.2: Twitter Routes
- Create `src/dataSources/twitter/routes.ts`
- Endpoints (deployment token auth + proxy middleware):
  - `GET /api/data-sources/twitter/search` — query param: `q` (required), `max_results`, `start_time`, `end_time`
  - `GET /api/data-sources/twitter/tweets/:tweetId` — get specific tweet
  - `GET /api/data-sources/twitter/users/:username` — get user profile
  - `GET /api/data-sources/twitter/users/:userId/tweets` — get user's tweets, query params: `max_results`
- Zod validation on all query/path params
- Rate limiting: 60 requests/minute per deployment
- Register in data source router
- **Files:** `src/dataSources/twitter/routes.ts`

### Task 2.3: Twitter OpenClaw Skill
- Create clawhub skill package `vincent-twitter`
- Skill reads deployment access token from OpenClaw environment
- Exposes functions to the agent:
  - `search_twitter(query, max_results?)` — search recent tweets
  - `get_tweet(tweet_id)` — get a specific tweet
  - `get_twitter_user(username)` — get user profile
  - `get_user_tweets(user_id, max_results?)` — get user's recent tweets
- Each function calls the corresponding proxy endpoint on heyvincent.ai
- Include clear error messages when credits are exhausted
- Publish to clawhub
- **Files:** New skill package (separate repo or `/skills/twitter/` directory)

### Task 2.4: Pre-install Twitter Skill in OpenClaw Setup
- Add `npx --yes clawhub@latest install vincent-twitter || true` to `buildSetupScript()` in `openclaw.service.ts`
- Configure the skill with the deployment's access token
- **Files:** `src/services/openclaw.service.ts`

---

## Phase 3: Brave Search Data Source

### Task 3.1: Brave Search Proxy Handler
- Create `src/dataSources/brave/handler.ts`
- Implement proxy functions:
  - `webSearch(query, options)` → `GET https://api.search.brave.com/res/v1/web/search`
    - Forward: q, count (default 10, max 20), offset, freshness, country
    - Auth: `X-Subscription-Token` header with `BRAVE_SEARCH_API_KEY`
  - `newsSearch(query, options)` → `GET https://api.search.brave.com/res/v1/news/search`
    - Forward: q, count, freshness
- Return 503 if `BRAVE_SEARCH_API_KEY` not configured
- Validate and sanitize inputs
- **Files:** `src/dataSources/brave/handler.ts`

### Task 3.2: Brave Search Routes
- Create `src/dataSources/brave/routes.ts`
- Endpoints (deployment token auth + proxy middleware):
  - `GET /api/data-sources/brave/web` — query param: `q` (required), `count`, `offset`, `freshness`
  - `GET /api/data-sources/brave/news` — query param: `q` (required), `count`, `freshness`
- Zod validation on query params
- Rate limiting: 60 requests/minute per deployment
- Register in data source router
- **Files:** `src/dataSources/brave/routes.ts`

### Task 3.3: Brave Search OpenClaw Skill
- Create clawhub skill package `vincent-brave-search`
- Skill reads deployment access token from OpenClaw environment
- Exposes functions:
  - `web_search(query, count?, freshness?)` — web search
  - `news_search(query, count?, freshness?)` — news search
- Each function calls the corresponding proxy endpoint on heyvincent.ai
- Publish to clawhub
- **Files:** New skill package (separate repo or `/skills/brave-search/` directory)

### Task 3.4: Pre-install Brave Search Skill in OpenClaw Setup
- Add `npx --yes clawhub@latest install vincent-brave-search || true` to `buildSetupScript()` in `openclaw.service.ts`
- Configure the skill with the deployment's access token
- **Files:** `src/services/openclaw.service.ts`

---

## Phase 4: Frontend

### Task 4.1: API Client Functions
- Add to `frontend/src/api.ts`:
  - `getDataSources()` — `GET /api/data-sources`
  - `getDataSourceCredits()` — `GET /api/data-sources/credits`
  - `addDataSourceCredits(amount)` — `POST /api/data-sources/credits`
  - `getDataSourceUsage()` — `GET /api/data-sources/usage`
  - `getDataSourceUsageHistory()` — `GET /api/data-sources/usage/history`
- Define TypeScript interfaces for responses
- **Files:** `frontend/src/api.ts`

### Task 4.2: Data Sources Page
- Create `frontend/src/pages/DataSources.tsx`
- **Credit Balance Section:**
  - Current balance display with progress bar (out of total credits ever purchased + initial $10)
  - "Add Credits" button opening modal
  - Color coding: green (>$5), yellow ($2-$5), red (<$2)
- **Available Data Sources Section:**
  - Card for each data source showing: name, description, status badge, pricing range
  - Current month usage stats per data source (request count, total cost)
  - "Coming soon" badge for inactive data sources
- **Usage History Section:**
  - Monthly breakdown table (month, total requests, total cost)
- **Add Credits Modal:**
  - Amount input ($5-$500 range)
  - Submit button → Stripe off-session charge
  - 3D Secure handling (redirect if needed)
  - Success toast with updated balance
- **Files:** `frontend/src/pages/DataSources.tsx`

### Task 4.3: Navigation Updates
- Add "Data Sources" link to sidebar navigation in `AppSidebar.tsx`
- Add route in `App.tsx` for `/data-sources` → `DataSources` page (protected route)
- **Files:** `frontend/src/components/AppSidebar.tsx`, `frontend/src/App.tsx`

### Task 4.4: Account Page Integration
- Add data source credit balance summary to Account page (in billing section)
- Show alongside existing subscription and LLM credit info
- Link to Data Sources page for details
- **Files:** `frontend/src/pages/Account.tsx`

---

## Phase 5: Testing & Polish

### Task 5.1: Backend Integration Tests
- Test deployment token auth middleware (valid token, invalid token, wrong status)
- Test credit check and deduction (sufficient, insufficient, concurrent deductions)
- Test usage logging and aggregation
- Test proxy middleware flow end-to-end (mock upstream APIs)
- Test management endpoints (list, credits, usage)
- **Files:** `src/__tests__/dataSources/` or `src/dataSources/__tests__/`

### Task 5.2: Rate Limiting
- Add per-deployment rate limiting to data source proxy endpoints
- Use existing rate limiting infrastructure (express-rate-limit)
- Key by deployment ID (from auth middleware)
- 60 req/min default, configurable per data source
- Return 429 with retry-after header when exceeded
- **Files:** `src/dataSources/proxyMiddleware.ts` or separate rate limit config

### Task 5.3: Error Handling & Edge Cases
- Handle upstream API errors gracefully (timeouts, 429s, 500s)
- Implement retry logic for transient upstream failures (optional, simple)
- Handle Stripe payment failures for credit purchases
- Handle race conditions on credit deduction (Prisma transactions)
- Add appropriate error codes and messages for all failure modes
- **Files:** Various

### Task 5.4: Monitoring & Observability
- Add logging for all proxy requests (data source, endpoint, cost, latency, success/failure)
- Add Sentry breadcrumbs for data source operations
- Log credit balance warnings (when user drops below $2)
- **Files:** Various

---

## Implementation Order

1. **Phase 1** (Core Infrastructure) — Must be done first, provides the foundation
2. **Phase 2** (Twitter) and **Phase 3** (Brave Search) — Can be done in parallel after Phase 1
3. **Phase 4** (Frontend) — Can start as soon as Phase 1 management endpoints are done
4. **Phase 5** (Testing & Polish) — Ongoing throughout, final pass after features complete

### Dependencies
```
1.1 (Schema) ← 1.2 (Registry) — no dependency, parallel OK
1.1 (Schema) ← 1.3 (Auth middleware) — needs User/Deployment models
1.1 (Schema) ← 1.4 (Credit/Usage service) — needs new models
1.2 + 1.3 + 1.4 ← 1.5 (Proxy middleware) — needs all three
1.4 + 1.5 ← 1.6 (Management API) — needs services and middleware
1.7 (Env vars) — no dependency, can be done anytime

Phase 1 complete ← Phase 2 (Twitter)
Phase 1 complete ← Phase 3 (Brave Search)
1.6 complete ← Phase 4 (Frontend)

Phase 2 ← 2.3 + 2.4 (Skill + Install) — can wait until backend proxy tested
Phase 3 ← 3.3 + 3.4 (Skill + Install) — can wait until backend proxy tested
```

### Estimated Scope
- **Phase 1:** ~15 files touched/created
- **Phase 2:** ~3 files created, 1 modified
- **Phase 3:** ~3 files created, 1 modified
- **Phase 4:** ~4 files created/modified
- **Phase 5:** ~5 files created/modified
- **Total:** ~25-30 files
