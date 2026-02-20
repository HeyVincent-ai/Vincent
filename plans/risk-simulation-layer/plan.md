# Pre-Trade Risk Simulation Layer + Human Override / Time-Delayed Escalation

## Context

Vincent is a secure secret management service for AI agents with trading capabilities (EVM wallets via ZeroDev, Polymarket via CLOB API). Today, the policy system provides per-secret, per-transaction guards (spending limits, allowlists, approval thresholds) but has no portfolio-level risk awareness. An agent can make individually-compliant trades that collectively create dangerous concentration, correlation, or exposure. There is also no mechanism for "soft" warnings, graduated escalation, or automatic defensive posture under volatile conditions.

These two features transform Vincent from a per-transaction gatekeeper into a portfolio-aware risk engine with constrained autonomy — "the Stripe Radar for agentic trading."

### Lessons from Stripe Radar

Stripe Radar assesses 1,000+ characteristics per transaction in sub-100ms with a 0.1% false positive rate. Five architectural principles from Radar inform this design:

1. **Single composite score, not a bag of metrics.** Radar produces one fraud score. We produce one `riskScore` (0-100) that collapses concentration, correlation, volatility, and behavioral signals into a single number. Escalation tiers map directly to score ranges. Individual signal contributions are preserved for explainability but the score is what drives decisions.

2. **Explainability is a product feature, not a debugging tool.** Radar's "Risk Insights" shows users *which* signals drove a block — name-to-email mismatch, card-to-IP frequency, etc. Every simulation result includes a `signalContributions` array showing what raised or lowered the score (e.g. "concentration: +35, low volatility: -10, stablecoin position: -5"). Users see *why*, not just *what*.

3. **Graduated response: block OR divert to additional checks.** Radar doesn't just allow/deny — it routes borderline transactions to 3D Secure. Our equivalent is the SOFT_BLOCK tier: the trade isn't denied, it's queued for human approval. The system says "I'm not sure" rather than pretending certainty.

4. **Feedback loops make the system smarter.** When a user approves a SOFT_BLOCK, that's signal that thresholds may be too aggressive. When a user denies, that validates the system. We track override rates per secret and surface threshold tuning suggestions when false positive rates exceed 20%.

5. **Network-level signals beat per-entity analysis.** Radar's biggest advantage is cross-merchant pattern detection. Our equivalent: cross-secret correlation within the same user. If a user has 3 wallets all buying the same token simultaneously, that's a concentration signal invisible to per-secret analysis.

### Design Decisions
- **Always-on by default, server-side:** The simulation runs automatically on Vincent's backend before every trade. The agent-facing API is unchanged — agents send the same requests they always have. The risk layer is invisible infrastructure, not an agent-side concern.
- **Opt-out available:** Users can disable the risk simulation for any secret via `PUT /api/secrets/:secretId/risk/settings` with `{ simulationEnabled: false }`. A per-secret `simulationEnabled` flag (default `true`) controls this. When disabled, trades go through the existing policy checker only — no portfolio snapshot, no simulation, no escalation. The opt-out is stored on a new `RiskSettings` model so it persists and is visible in the dashboard.
- **Full portfolio from day one:** Both EVM (Alchemy) and Polymarket positions are included in the portfolio snapshot from Phase 1. No blind spots.
- **Portfolio snapshot caching:** If a snapshot was fetched within the last 60 seconds, reuse it. This keeps latency at ~50ms for rapid sequential trades while guaranteeing coverage.
- **Latency budget: <100ms p99 for cached snapshots.** The risk check runs in the hot path of every trade. Portfolio snapshot fetch is the expensive operation (~500ms); the cache ensures subsequent trades in a 60s window add <50ms. Simulation + scoring + signing are pure computation (~5ms). We instrument `simulationMs` on every report to track drift.

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
  // Composite score: 0-100, higher = more risky. Drives escalation tiers directly.
  riskScore: number;
  signalContributions: SignalContribution[];  // What raised/lowered the score

  // Individual metrics (inputs to the score)
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

// Explainability: each signal's contribution to the composite riskScore
export interface SignalContribution {
  signal: string;    // e.g. "concentration", "volatility", "correlation", "trade_size"
  value: number;     // The raw metric value
  points: number;    // How many points this added (+) or subtracted (-) from riskScore
  label: string;     // Human-readable explanation, e.g. "ETH is 42% of portfolio (+35)"
}
```

### Risk Score Computation

The composite `riskScore` (0-100) is a weighted sum of individual signal scores, clamped to [0, 100]:

| Signal | Weight | Logic |
|--------|--------|-------|
| Concentration | 35 | `min(35, largestPositionPct * 0.7)` — 50% position = 35 points |
| Correlation | 15 | `correlationScore * 15` — fully correlated = 15 points |
| Trade size | 20 | `min(20, tradeAsPercentOfPortfolio * 0.4)` — 50% of portfolio trade = 20 points |
| Volatility | 20 | `min(20, (annualizedVol / 200) * 20)` — 200% vol = 20 points |
| Leverage | 10 | `min(10, (leverageRatio ?? 1 - 1) * 5)` — 3x leverage = 10 points |

Score ranges map to default escalation tiers: 0-25 INFO, 25-50 WARN, 50-70 SOFT_BLOCK, 70-90 HARD_BLOCK, 90+ SAFE_MODE.

Weights are hardcoded in Phase 1. Future: user-configurable via `RiskSettings`.

### Implementation Notes

- `buildPortfolioSnapshot()` reuses existing `alchemyService` for EVM balances and `polymarketSkill.getHoldings()` for Polymarket — no new external dependencies
- `computeRiskMetrics()` is a pure function (easy to unit test). Returns both the score and the signal contributions that explain it.
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

### SimulationResult Shape

The simulation result is the core data object — it's what gets signed, stored, and surfaced to users:

```typescript
export interface SimulationResult {
  secretId: string;
  actionData: { asset: string; amountUsd: number; direction: 'buy' | 'sell'; actionType: string };
  portfolioBefore: PortfolioSnapshot;
  portfolioAfter: PortfolioSnapshot;
  riskMetrics: RiskMetrics;          // Includes riskScore + signalContributions
  verdict: 'pass' | 'warn' | 'block';
  warnings: string[];
  reportHash: string;
  reportSignature?: string;
  simulationMs: number;              // Latency tracking — alerts if >100ms
}
```

The `signalContributions` inside `riskMetrics` are the explainability layer. When a user sees "Trade blocked (risk score: 78)", they can drill into: "concentration: ETH is 45% of portfolio (+32), trade size: $5,000 is 30% of portfolio (+12), volatility: ETH at 150% annualized (+15), correlation: 3 same-chain positions (+10), stablecoin buffer: USDC position (-5)".

### Signing Design
- Canonical JSON (sorted keys) -> SHA-256 -> HMAC-SHA256 with `REPORT_SIGNING_KEY` env var
- Signature covers `hash + "|" + timestamp` to prevent replay
- New env var: `REPORT_SIGNING_KEY` in `src/utils/env.ts` (optional, defaults to dev key)

### Verification
- Unit test simulation with known portfolio + trade -> assert post-trade state is correct
- Unit test signing roundtrip: sign -> verify = true, tamper -> verify = false
- Integration test `POST /risk/simulate` returns signed report with expected shape
- Verify `signalContributions` array is non-empty and contributions sum to `riskScore`

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

### Escalation Tiers (Driven by Risk Score)

Tiers map directly to the composite `riskScore` from the metrics engine:

| Tier | Risk Score | Action | Notification |
|------|-----------|--------|-------------|
| INFO | 0-25 | Log, trade proceeds | None |
| WARN | 25-50 | Trade proceeds | Telegram info message with signal breakdown |
| SOFT_BLOCK | 50-70 | Queue for human approval | Telegram Approve/Deny with Risk Insights |
| HARD_BLOCK | 70-90 | Trade denied | Telegram alert with full signal breakdown |
| SAFE_MODE | 90+ or 3+ HARD_BLOCKs in 1hr | All trades restricted | Telegram + SafeMode activated |

Score thresholds are configurable via `RiskSettings`. The signal contributions are included in every Telegram notification so users see *why*, not just *what* (following the Stripe Risk Insights pattern).

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

### Feedback Loop: Learning from Overrides

When a user approves a SOFT_BLOCK (overrides the system), that's signal. When they deny, the system was right.

```typescript
// Tracked on EscalationEvent when resolved
export interface EscalationOutcome {
  overridden: boolean;           // User approved despite SOFT_BLOCK/HARD_BLOCK
  tradeOutcome?: 'profitable' | 'loss' | 'neutral';  // From post-trade PnL (future)
}
```

**Phase 4 scope:**
- Track override rate per secret: `overrides / total_escalations` over rolling 30-day window
- Surface in `GET /api/secrets/:secretId/risk/settings` response: `{ overrideRate: 0.35, suggestion: "Your SOFT_BLOCK threshold may be too aggressive — 35% of flagged trades were approved" }`
- No automatic threshold adjustment yet — just visibility. Users decide whether to tune.

**Future (not in scope):** Auto-tune score thresholds based on override rates. When override rate > 30% for 2+ weeks, suggest specific threshold changes.

### Cross-Secret Correlation (Same User)

Stripe's biggest edge is network-level pattern detection across merchants. Our equivalent: detecting correlated behavior across a single user's multiple secrets.

**Phase 4 scope:**
- When running `preTradeCheck`, if the user owns multiple secrets with `simulationEnabled`, fetch cached snapshots for all of them
- Compute `crossSecretConcentration`: aggregate exposure to the same asset across all user wallets. If Secret A has 20% ETH and Secret B has 25% ETH, the user's *total* ETH exposure is higher than either secret sees alone
- Add `crossSecretExposure` as a signal contribution (+0-15 points) to the risk score
- This is a pure read — no writes to other secrets' data, no cross-secret side effects

```typescript
// Added to RiskMetrics
crossSecretExposure?: {
  asset: string;
  totalAcrossSecrets: number;  // Combined % across all user's portfolios
  thisSecretPct: number;       // This secret's contribution
  otherSecretsPct: number;     // Sum from other secrets
};
```

### Files Modified

- **`src/risk/preTradeHook.service.ts`** — Add safe mode check at top of `preTradeCheck()`, add escalation evaluation after simulation
- **`src/risk/metrics.service.ts`** — Add `crossSecretExposure` signal, accept optional `otherSnapshots` parameter
- **`src/telegram/bot.ts`** — Add `/safemode` and `/risk` commands; extend `formatApprovalMessage()` with risk signal breakdown
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
- Unit test escalation tier selection with various risk score ranges
- Unit test safe mode restrictions block unauthorized action types
- Integration test: trigger 3 HARD_BLOCKs -> verify safe mode auto-activates
- Integration test: activate safe mode -> attempt swap -> expect deny
- Integration test: deactivate safe mode -> attempt swap -> expect allow
- Unit test feedback loop: resolve SOFT_BLOCK with override -> verify override rate updates
- Unit test cross-secret correlation: two secrets with 25% ETH each -> crossSecretExposure shows 50% total

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
| `src/telegram/bot.ts` | 4 | Add `/safemode` + `/risk` commands; risk signal breakdown in approval messages (~80 lines) |
| `src/api/routes/index.ts` | 1-5 | Mount new routers (4 lines) |
| `src/index.ts` | 5 | Start/stop volatility worker (3 lines) |
| `src/utils/env.ts` | 2,5 | Add REPORT_SIGNING_KEY + VOLATILITY_POLL_INTERVAL_MS |

## Design Principles (from Stripe Radar)

These principles should guide implementation decisions throughout all phases:

1. **Score first, explain second.** Every decision flows from the composite `riskScore`. Individual metrics exist to *explain* the score, not to independently trigger actions. This prevents the "too many knobs" problem where 10 independent thresholds create unpredictable interactions.

2. **False positives are a product bug.** Track override rate. If users are approving >20% of SOFT_BLOCKs, the system is crying wolf. Surface this data in the dashboard so users can tune thresholds.

3. **Explainability builds trust.** Every block/warn includes the signal breakdown. Users should never wonder "why was my trade blocked?" — the answer is always visible in the Telegram message and API response.

4. **Latency is a feature constraint.** The risk check is in the hot path. If it adds >100ms (p99, cached), it's a bug. Instrument `simulationMs` and alert on drift. The 60s snapshot cache is the primary latency lever.

5. **Start simple, add signals.** Phase 1 ships with 5 signals and hardcoded weights. The architecture supports adding signals without changing the scoring interface. New signals are just new entries in `signalContributions` — the score computation is a weighted sum.
