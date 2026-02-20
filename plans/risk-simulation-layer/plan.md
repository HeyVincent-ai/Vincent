# Pre-Trade Risk Simulation Layer + Human Override / Time-Delayed Escalation

## Context

Vincent is a secure secret management service for AI agents with trading capabilities (EVM wallets via ZeroDev, Polymarket via CLOB API). Today, the policy system provides per-secret, per-transaction guards (spending limits, allowlists, approval thresholds) but has no portfolio-level risk awareness. An agent can make individually-compliant trades that collectively create dangerous concentration, correlation, or exposure. There is also no mechanism for "soft" warnings, graduated escalation, or automatic defensive posture under volatile conditions.

These two features transform Vincent from a per-transaction gatekeeper into a portfolio-aware risk engine with constrained autonomy — "the Stripe Radar for agentic trading."

### Design Decisions
- **Always-on by default, server-side:** The simulation runs automatically on Vincent's backend before every trade. The agent-facing API is unchanged — agents send the same requests they always have. The risk layer is invisible infrastructure, not an agent-side concern.
- **Opt-out available:** Users can disable the risk simulation for any secret via `PUT /api/secrets/:secretId/risk/settings` with `{ simulationEnabled: false }`. A per-secret `simulationEnabled` flag (default `true`) controls this. When disabled, trades go through the existing policy checker only — no portfolio snapshot, no simulation, no escalation. The opt-out is stored on a new `RiskSettings` model so it persists and is visible in the dashboard.
- **Full portfolio from day one:** Both EVM (Alchemy) and Polymarket positions are included in the portfolio snapshot from Phase 1. No blind spots.
- **Portfolio snapshot caching:** If a snapshot was fetched within the last 60 seconds, reuse it. This keeps latency at ~50ms for rapid sequential trades while guaranteeing coverage.

---

## Phase 1: Portfolio Snapshot + Risk Metrics Engine

**Value:** Unified portfolio visibility across EVM + Polymarket with computed risk metrics. No trade blocking yet — purely additive. Ships the data layer that everything else builds on.

### New Files

| File | Purpose |
|------|---------|
| `src/risk/portfolio.service.ts` | Build unified portfolio snapshot across EVM (Alchemy) + Polymarket |
| `src/risk/metrics.service.ts` | Compute risk metrics from portfolio snapshots |
| `src/risk/portfolio.service.test.ts` | Tests |
| `src/risk/metrics.service.test.ts` | Tests |
| `src/api/routes/risk.routes.ts` | `GET /api/secrets/:secretId/risk/portfolio` endpoint |

### Schema Changes (`prisma/schema.prisma`)

```prisma
model RiskSettings {
  id                      String   @id @default(cuid())
  secretId                String   @unique @map("secret_id")
  simulationEnabled       Boolean  @default(true) @map("simulation_enabled")
  snapshotCacheTtlSeconds Int      @default(60) @map("snapshot_cache_ttl_seconds")
  createdAt               DateTime @default(now()) @map("created_at")
  updatedAt               DateTime @updatedAt @map("updated_at")

  secret Secret @relation(fields: [secretId], references: [id], onDelete: Cascade)
  @@map("risk_settings")
}
```

Add `riskSettings RiskSettings?` relation to `Secret` model.

```prisma
model RiskSimulation {
  id                String   @id @default(cuid())
  secretId          String   @map("secret_id")
  transactionLogId  String?  @map("transaction_log_id")
  actionData        Json     @map("action_data")
  portfolioBefore   Json     @map("portfolio_before")
  portfolioAfter    Json     @map("portfolio_after")
  riskMetrics       Json     @map("risk_metrics")
  verdict           String   // 'pass' | 'warn' | 'block'
  warnings          Json?
  reportHash        String   @map("report_hash")
  reportSignature   String?  @map("report_signature")
  simulationMs      Int      @map("simulation_ms")
  createdAt         DateTime @default(now()) @map("created_at")

  secret Secret @relation(fields: [secretId], references: [id], onDelete: Cascade)
  @@index([secretId, createdAt])
  @@map("risk_simulations")
}
```

Add `riskSimulations RiskSimulation[]` relation to `Secret` model.

### Key Types

```typescript
// src/risk/portfolio.service.ts
export interface PortfolioSnapshot {
  totalValueUsd: number;
  positions: PortfolioPosition[];
  timestamp: Date;
}

export interface PortfolioPosition {
  asset: string;                    // Token address, "ETH", or Polymarket tokenId
  symbol: string;
  valueUsd: number;
  quantity: number;
  priceUsd: number;
  percentOfPortfolio: number;
  source: 'evm' | 'polymarket';
  chainId?: number;
}
```

```typescript
// src/risk/metrics.service.ts
export interface RiskMetrics {
  largestPositionPct: number;
  largestPositionAsset: string;
  top3ConcentrationPct: number;
  correlationScore: number;          // 0-1, simplified: same-chain = 0.6, stables = 0, cross-chain = 0.3
  tradeValueUsd: number;
  tradeAsPercentOfPortfolio: number;
  postTradeExposurePct: number;
  portfolioVolatility: number | null;
  tradeAssetVolatility: number | null;
  liquidationDistance: number | null; // null until Hyperliquid integration
  leverageRatio: number | null;      // null until Hyperliquid integration
}
```

### Implementation Notes

- `buildPortfolioSnapshot()` reuses existing `alchemyService` for EVM balances and `polymarketSkill.getHoldings()` for Polymarket — no new external dependencies
- `computeRiskMetrics()` is a pure function (easy to unit test)
- Correlation score is simplified in Phase 1: crypto-crypto = 0.6, stables = 0, same-chain bonus = +0.1
- Portfolio snapshot cache: in-memory `Map<secretId, { snapshot, fetchedAt }>` with TTL from `RiskSettings.snapshotCacheTtlSeconds` (default 60s)

### Verification
- Unit test `metrics.service` with mock portfolio snapshots covering edge cases (empty portfolio, single asset, all stables)
- Integration test `GET /api/secrets/:secretId/risk/portfolio` with a test secret that has EVM wallet metadata

---

## Phase 2: Simulation Engine + Signed Execution Reports

**Value:** Dry-run simulation API. Agents can simulate trades before executing. Signed reports provide tamper-evident audit trail.

### New Files

| File | Purpose |
|------|---------|
| `src/risk/simulation.service.ts` | Simulate post-trade state, orchestrate full pipeline |
| `src/risk/signing.service.ts` | HMAC-SHA256 report signing + verification |
| `src/risk/simulation.service.test.ts` | Tests |
| `src/risk/signing.service.test.ts` | Tests |

### New Endpoints (add to `src/api/routes/risk.routes.ts`)

```
GET  /api/secrets/:secretId/risk/settings      — Get risk settings (session auth)
PUT  /api/secrets/:secretId/risk/settings      — Update risk settings incl. opt-out (session auth)
POST /api/secrets/:secretId/risk/simulate      — Dry-run simulation (API key auth)
GET  /api/secrets/:secretId/risk/reports        — List past reports (session auth)
GET  /api/secrets/:secretId/risk/reports/:id    — Get single report (session auth)
POST /api/secrets/:secretId/risk/verify         — Verify report signature (API key auth)
```

### Key Functions

```typescript
// src/risk/simulation.service.ts
export async function simulatePostTrade(
  snapshot: PortfolioSnapshot,
  action: { asset: string; amountUsd: number; direction: 'buy' | 'sell'; chainId?: number }
): Promise<PortfolioSnapshot>

export async function runSimulation(input: {
  secretId: string;
  actionType: 'transfer' | 'swap' | 'polymarket_bet' | 'send_transaction';
  asset: string;
  amountUsd: number;
  direction: 'buy' | 'sell';
  chainId?: number;
}): Promise<SimulationResult>
```

```typescript
// src/risk/signing.service.ts
export function hashReport(data: Record<string, unknown>): string        // SHA-256 of canonical JSON
export function signReport(reportHash: string): SignedReport              // HMAC-SHA256
export function verifyReport(hash: string, sig: string, ts: string): boolean
```

### Signing Design
- Canonical JSON (sorted keys) -> SHA-256 -> HMAC-SHA256 with `REPORT_SIGNING_KEY` env var
- Signature covers `hash + "|" + timestamp` to prevent replay
- New env var: `REPORT_SIGNING_KEY` in `src/utils/env.ts` (optional, defaults to dev key)

### Verification
- Unit test simulation with known portfolio + trade -> assert post-trade state is correct
- Unit test signing roundtrip: sign -> verify = true, tamper -> verify = false
- Integration test `POST /risk/simulate` returns signed report with expected shape

---

## Phase 3: Risk Policies + Pre-Trade Hook Integration

**Value:** Simulation runs automatically before every trade. New policy types enforce portfolio-level risk limits. This is the phase where the system becomes "active."

### Schema Changes

Extend `PolicyType` enum:
```prisma
enum PolicyType {
  // ... existing 8 types ...
  MAX_PORTFOLIO_EXPOSURE         // Max % of portfolio in single asset
  MAX_CORRELATION_CONCENTRATION  // Max % in correlated assets
  MAX_LEVERAGE                   // Max leverage ratio (Hyperliquid future)
  MIN_LIQUIDATION_DISTANCE       // Min % distance to liquidation
  VOLATILITY_GATE                // Block/require approval when vol exceeds threshold
}
```

### New Files

| File | Purpose |
|------|---------|
| `src/risk/preTradeHook.service.ts` | Central integration point replacing direct `checkPolicies()` calls |
| `src/risk/preTradeHook.service.test.ts` | Tests |

### Pre-Trade Hook — The Single Integration Point

```typescript
// src/risk/preTradeHook.service.ts
export interface PreTradeResult {
  policyResult: PolicyCheckResult;         // From existing checker
  simulation: SimulationResult | null;     // From Phase 2
  finalVerdict: 'allow' | 'deny' | 'require_approval';
  finalReason?: string;
}

export async function preTradeCheck(
  secretId: string,
  policyAction: PolicyCheckAction,
  simulationInput?: {
    asset: string;
    amountUsd: number;
    direction: 'buy' | 'sell';
    actionType: 'transfer' | 'swap' | 'polymarket_bet' | 'send_transaction';
    chainId?: number;
  }
): Promise<PreTradeResult>
```

**Flow:**
1. Check `RiskSettings.simulationEnabled` for this secret — if `false`, skip straight to existing `checkPolicies()` and return (full opt-out path)
2. Call existing `checkPolicies(secretId, policyAction)` — if hard deny, return immediately
3. Run `runSimulation()` — evaluate new risk policy types against computed metrics (uses cached snapshot if within TTL)
4. Most restrictive verdict wins

### Files Modified (Minimal Changes)

**`src/skills/evmWallet.service.ts`** — In `executeTransfer()`, `executeSendTransaction()`, `executeSwap()`: replace `checkPolicies()` with `preTradeCheck()`. The returned object is shaped identically (`{verdict, triggeredPolicy}`) so all downstream deny/approve/execute logic stays untouched.

```typescript
// BEFORE (in each function)
const policyResult = await checkPolicies(secretId, policyAction);

// AFTER
const { finalVerdict, policyResult } = await preTradeCheck(secretId, policyAction, {
  asset: token ?? 'ETH',
  amountUsd: usdValue ?? 0,
  direction: 'buy',
  actionType: 'transfer',
  chainId,
});
const verdict = finalVerdict; // Used by existing if/else blocks unchanged
```

**`src/skills/polymarketSkill.service.ts`** — Same pattern in `placeBet()`.

**`src/services/policy.service.ts`** — Add 5 new Zod schemas + config interfaces for new policy types to `policyConfigSchemas` map.

### New Policy Configs

```typescript
MAX_PORTFOLIO_EXPOSURE:     { maxPercentage: number; approvalOverride?: boolean }
MAX_CORRELATION_CONCENTRATION: { maxPercentage: number; approvalOverride?: boolean }
MAX_LEVERAGE:               { maxRatio: number; approvalOverride?: boolean }
MIN_LIQUIDATION_DISTANCE:   { minPercentage: number; approvalOverride?: boolean }
VOLATILITY_GATE:            { maxAnnualizedVol: number; action: 'deny'|'require_approval'; approvalOverride?: boolean }
```

### Verification
- Unit test `preTradeCheck` with mocked policies: no risk policies = passthrough, risk policy violation = block
- Integration test: create a secret with `MAX_PORTFOLIO_EXPOSURE` policy at 25%, attempt a transfer that would make one position 30% of portfolio -> expect deny or require_approval
- Existing tests must still pass (the hook is transparent when no risk policies exist)

---

## Phase 4: Escalation Tiers + Safe Mode

**Value:** Graduated response system. Soft warnings, automatic approval queueing, and a defensive "safe mode" that restricts operations under dangerous conditions. This is the "constrained autonomy" differentiator.

### Schema Changes

```prisma
enum EscalationTier {
  INFO         // Logged only
  WARN         // Telegram notification, trade proceeds
  SOFT_BLOCK   // Trade queued for human approval
  HARD_BLOCK   // Trade denied
  SAFE_MODE    // System enters safe mode
}

model EscalationEvent {
  id               String         @id @default(cuid())
  secretId         String         @map("secret_id")
  transactionLogId String?        @map("transaction_log_id")
  tier             EscalationTier
  reason           String
  riskMetrics      Json?          @map("risk_metrics")
  resolvedAt       DateTime?      @map("resolved_at")
  resolvedBy       String?        @map("resolved_by")
  createdAt        DateTime       @default(now()) @map("created_at")

  secret Secret @relation(fields: [secretId], references: [id], onDelete: Cascade)
  @@index([secretId, createdAt])
  @@index([tier, createdAt])
  @@map("escalation_events")
}

model SafeMode {
  id            String    @id @default(cuid())
  secretId      String    @unique @map("secret_id")
  active        Boolean   @default(false)
  activatedAt   DateTime? @map("activated_at")
  activatedBy   String?   @map("activated_by")  // "system:escalation", "user:telegram", etc.
  reason        String?
  restrictions  Json      @map("restrictions")   // SafeModeRestrictions JSON
  deactivatedAt DateTime? @map("deactivated_at")
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")

  secret Secret @relation(fields: [secretId], references: [id], onDelete: Cascade)
  @@map("safe_modes")
}
```

Add `safeMode SafeMode?` and `escalationEvents EscalationEvent[]` relations to `Secret`.

### New Files

| File | Purpose |
|------|---------|
| `src/risk/escalation.service.ts` | Evaluate escalation tier, manage events, safe mode CRUD |
| `src/risk/escalation.service.test.ts` | Tests |
| `src/api/routes/escalation.routes.ts` | Escalation event listing + resolution |
| `src/api/routes/safeMode.routes.ts` | Safe mode activate/deactivate/status |

### Escalation Tiers (Default Thresholds)

| Tier | Trigger | Action | Notification |
|------|---------|--------|-------------|
| INFO | All metrics within bounds | Log, trade proceeds | None |
| WARN | Single position >20% or vol >80% annualized | Trade proceeds | Telegram info message |
| SOFT_BLOCK | Position >35% or vol >120% or daily spend >80% of limit | Queue for human approval | Telegram Approve/Deny |
| HARD_BLOCK | Position >50% or simulation verdict=block | Trade denied | Telegram alert |
| SAFE_MODE | 3+ HARD_BLOCKs in 1hr, or manual trigger | All trades restricted | Telegram + SafeMode activated |

Thresholds are configurable via risk policies; these are fallback defaults.

### Safe Mode Restrictions

```typescript
export interface SafeModeRestrictions {
  maxTxUsd: number;            // Default $50
  allowedActions: string[];    // Default ['transfer'] — no swaps, no bets
  leverageCap: number;         // Default 1.0 (spot only)
  blockNewPositions: boolean;  // Default true — only sell/close allowed
}
```

- **Activation:** Automatic (3+ HARD_BLOCKs in 1hr) or manual (API/Telegram `/safemode`)
- **Deactivation:** Manual only. Never auto-deactivates. Human must explicitly decide.

### Files Modified

- **`src/risk/preTradeHook.service.ts`** — Add safe mode check at top of `preTradeCheck()`, add escalation evaluation after simulation
- **`src/telegram/bot.ts`** — Add `/safemode` and `/risk` commands; extend `formatApprovalMessage()` with risk warnings
- **`src/api/routes/index.ts`** — Mount escalation + safe mode routes

### New Endpoints

```
GET  /api/secrets/:secretId/escalations                    — List events (session auth)
POST /api/secrets/:secretId/escalations/:id/resolve        — Resolve event (session auth)
GET  /api/secrets/:secretId/safe-mode                      — Status (session or API key)
POST /api/secrets/:secretId/safe-mode/activate             — Activate (session auth)
POST /api/secrets/:secretId/safe-mode/deactivate           — Deactivate (session auth)
```

### Verification
- Unit test escalation tier selection with various risk metric combinations
- Unit test safe mode restrictions block unauthorized action types
- Integration test: trigger 3 HARD_BLOCKs -> verify safe mode auto-activates
- Integration test: activate safe mode -> attempt swap -> expect deny
- Integration test: deactivate safe mode -> attempt swap -> expect allow

---

## Phase 5: Volatility Monitoring Worker

**Value:** Proactive market monitoring. Automatic safe mode under extreme volatility. The `VOLATILITY_GATE` policy becomes live.

### Schema Changes

```prisma
model VolatilitySnapshot {
  id         String   @id @default(cuid())
  asset      String
  chainId    Int?     @map("chain_id")
  volatility Float
  price      Float
  source     String   // "coingecko"
  period     String   // "1h", "24h"
  createdAt  DateTime @default(now()) @map("created_at")

  @@index([asset, createdAt])
  @@map("volatility_snapshots")
}
```

### New Files

| File | Purpose |
|------|---------|
| `src/risk/volatility.service.ts` | Background worker (5-min interval), volatility computation, cache |
| `src/risk/volatility.service.test.ts` | Tests |
| `src/api/routes/volatility.routes.ts` | `GET /api/volatility/current`, `GET /api/volatility/history` |

### Worker Design

- Follows same `setInterval` pattern as `src/telegram/timeoutChecker.ts`
- Polls CoinGecko `/coins/{id}/market_chart` (24h range, hourly) for ETH, BTC, and active portfolio tokens
- Computes realized volatility: `stdev(log_returns) * sqrt(periods_per_year)`
- In-memory cache with 5-min TTL (matches existing `price.service.ts` pattern)
- On extreme vol (>200% annualized): finds affected secrets with positions, triggers escalation -> may auto-activate safe mode

### Files Modified

- **`src/index.ts`** — `startVolatilityWorker()` on startup, `stopVolatilityWorker()` on shutdown
- **`src/utils/env.ts`** — Add optional `VOLATILITY_POLL_INTERVAL_MS` env var
- **`src/api/routes/index.ts`** — Mount volatility routes

### Verification
- Unit test `computeRealizedVolatility()` with known price series
- Unit test worker tick: mock CoinGecko response -> assert snapshots persisted + cache updated
- Integration test: inject extreme vol data -> verify VOLATILITY_GATE policy triggers escalation

---

## Summary: All New Files

| File | Phase |
|------|-------|
| `src/risk/portfolio.service.ts` | 1 |
| `src/risk/metrics.service.ts` | 1 |
| `src/risk/simulation.service.ts` | 2 |
| `src/risk/signing.service.ts` | 2 |
| `src/risk/preTradeHook.service.ts` | 3 |
| `src/risk/escalation.service.ts` | 4 |
| `src/risk/volatility.service.ts` | 5 |
| `src/api/routes/risk.routes.ts` | 1-2 |
| `src/api/routes/escalation.routes.ts` | 4 |
| `src/api/routes/safeMode.routes.ts` | 4 |
| `src/api/routes/volatility.routes.ts` | 5 |
| Tests for each service | Same phase |

## Summary: Modified Files

| File | Phase | Change |
|------|-------|--------|
| `prisma/schema.prisma` | 1,4,5 | Add RiskSettings, RiskSimulation, EscalationEvent, SafeMode, VolatilitySnapshot models + 5 PolicyType values |
| `src/services/policy.service.ts` | 3 | Add 5 new Zod schemas + config types |
| `src/skills/evmWallet.service.ts` | 3 | Replace `checkPolicies()` with `preTradeCheck()` in 4 functions (~4 line changes each) |
| `src/skills/polymarketSkill.service.ts` | 3 | Replace `checkPolicies()` in `placeBet()` (~4 line change) |
| `src/telegram/bot.ts` | 4 | Add `/safemode` + `/risk` commands (~60 lines) |
| `src/api/routes/index.ts` | 1-5 | Mount new routers (4 lines) |
| `src/index.ts` | 5 | Start/stop volatility worker (3 lines) |
| `src/utils/env.ts` | 2,5 | Add REPORT_SIGNING_KEY + VOLATILITY_POLL_INTERVAL_MS |
