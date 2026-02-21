# Billing & Subscriptions

Vincent uses Stripe for all payment processing. There are three billing domains:

## 1. Pro Subscription ($10/month)

Unlocks mainnet EVM wallet usage. Testnets are always free.

**Flow:**
1. Agent attempts mainnet transaction without subscription
2. API returns error with subscribe link
3. User creates Stripe Checkout session via `POST /api/billing/subscribe`
4. User completes payment on Stripe
5. `checkout.session.completed` webhook activates subscription
6. Mainnet access enabled

**Cancellation:** Sets `cancel_at_period_end` on Stripe. Access continues until period expires. `customer.subscription.deleted` webhook marks as canceled.

**Files:**
- `src/billing/stripe.service.ts` — Stripe customer, checkout, subscription management
- `src/api/routes/billing.routes.ts` — REST endpoints

### Webhook Events Handled

| Event | Action |
|---|---|
| `checkout.session.completed` | Activate subscription with period dates |
| `invoice.paid` | Confirm subscription active |
| `invoice.payment_failed` | Mark as PAST_DUE |
| `customer.subscription.deleted` | Mark as CANCELED |
| `customer.subscription.updated` | Sync status and period dates |

The webhook handler checks metadata for `type: 'openclaw'` to distinguish OpenClaw subscriptions from standard ones.

## 2. Gas Usage Billing

Mainnet EVM transactions incur gas costs, tracked and billed to users.

**How gas tracking works:**
1. Each transaction records gas cost in USD via `gas.service.ts`
2. `GasUsage` records: tx hash, chain ID, gas used, gas price, USD cost
3. Monthly aggregation sums per-user costs into `MonthlyGasSummary`
4. Users view usage in dashboard

**Gas aggregation:**
- `gasAggregation.service.ts` provides per-user per-month aggregation
- Callable on-demand (not cron-based yet)
- Current month usage with recent transaction details
- Historical usage summaries

**Files:**
- `src/skills/gas.service.ts` — Per-transaction gas recording, subscription checks
- `src/billing/gasAggregation.service.ts` — Monthly aggregation and queries

**Deferred:** Stripe metered billing for automated gas invoicing (requires Stripe product setup).

## 3. OpenClaw Deployment ($25/month + LLM Credits)

Each OpenClaw VPS deployment requires its own subscription and credit system.

### Deployment Subscription

- $25/month per deployment via Stripe Checkout
- Provisioning only starts after `checkout.session.completed` webhook
- Cancel sets `cancel_at_period_end` — VPS runs until period ends
- `customer.subscription.deleted` webhook triggers VPS teardown

### LLM Credit System

Each deployment has a credit balance for OpenRouter LLM usage.

- Starts with $25 free credits
- OpenRouter key created with `limit: 25` (spending cap matches credits)
- Backend polls `getKeyUsage()` for per-key USD totals (cached 60s)
- Users add credits via `POST /api/openclaw/deployments/:id/credits`
- Charges existing Stripe payment method off-session
- On success: increment `creditBalanceUsd`, update OpenRouter key limit
- If 3D Secure required: returns `clientSecret` for frontend completion
- When credits hit $0: OpenRouter auto-blocks the key

**Files:**
- `src/services/openclaw.service.ts` — `getUsage()`, `addCredits()`
- `src/services/openrouter.service.ts` — Key management + usage polling

## 4. Data Source Credits

Per-user credit pool for Twitter/Brave Search API proxy usage.

- Every user gets $10 free on first use
- Per-API-call pricing (e.g., $0.01/tweet search, $0.005/web search)
- Credit deducted atomically after successful upstream call
- If balance insufficient: 402 Payment Required
- Users add credits via `POST /api/secrets/:id/data-sources/credits`
- Same off-session Stripe charge pattern as OpenClaw credits

**Files:**
- `src/dataSources/credit.service.ts` — Atomic credit check/deduct/add (raw SQL for atomicity)
- `src/api/routes/dataSourceManagement.routes.ts` — Management endpoints

## Stripe SDK Notes

Using Stripe SDK v20 (API version 2026-01-28.clover) which has breaking changes:
- `current_period_start/end` moved from `Subscription` to `SubscriptionItem` — handled by `extractPeriodDates()` helper
- `Invoice.subscription` field removed — replaced by `invoice.parent.subscription_details.subscription`
- Raw body for webhook verification captured via `express.json({ verify })` callback storing buffer on `req.rawBody`
