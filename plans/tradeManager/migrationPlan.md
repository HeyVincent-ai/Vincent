# Move Trade Manager to Vincent Backend

## Context

The Trade Manager is currently a standalone Node.js app (in `trade-manager/`) that runs on each OpenClaw VPS with its own SQLite database. It manages automated trading rules (stop-loss, take-profit, trailing stop) and monitors Polymarket prices via WebSocket to trigger sells.

We're moving it into the Vincent backend as a normal service so it can serve all agents centrally. The agent authenticates with its Vincent Polymarket API key. The standalone `trade-manager/` directory stays untouched.

## Key Design Decisions

- **Multi-tenant**: Every TradeRule/MonitoredPosition/RuleEvent is scoped by `secretId`
- **Trade execution**: Goes through `polymarketSkill.placeBet()` (policy enforcement + audit logging)
- **API paths**: Nested under existing `/api/skills/polymarket/rules/...`
- **WebSocket**: Single shared connection to Polymarket, subscribed to the union of all agents' active rule token IDs
- **Scope**: Core only (rules + monitoring + execution). No harness layer.

---

## Step 1: Prisma Schema — Add Trade Manager Models

**File:** `prisma/schema.prisma`

Add three new models + enums, with `secretId` for multi-tenancy:

```prisma
enum TradeRuleType {
  STOP_LOSS
  TAKE_PROFIT
  TRAILING_STOP
}

enum TradeRuleStatus {
  ACTIVE
  TRIGGERED
  CANCELED
  EXPIRED
  FAILED
}

enum TradeRuleEventType {
  RULE_CREATED
  RULE_EVALUATED
  RULE_TRIGGERED
  RULE_FAILED
  RULE_CANCELED
  RULE_TRAILING_UPDATED
  ACTION_ATTEMPT
  ACTION_EXECUTED
  ACTION_FAILED
}

model TradeRule {
  id              String          @id @default(cuid())
  secretId        String          @map("secret_id")
  ruleType        TradeRuleType   @map("rule_type")
  marketId        String          @map("market_id")
  marketSlug      String?         @map("market_slug")
  tokenId         String          @map("token_id")
  side            String          @default("BUY")
  triggerPrice    Float           @map("trigger_price")
  trailingPercent Float?          @map("trailing_percent")
  action          String          // JSON: { type: "SELL_ALL" } or { type: "SELL_PARTIAL", amount: N }
  status          TradeRuleStatus @default(ACTIVE)
  triggeredAt     DateTime?       @map("triggered_at")
  triggerTxHash   String?         @map("trigger_tx_hash")
  errorMessage    String?         @map("error_message")
  createdAt       DateTime        @default(now()) @map("created_at")
  updatedAt       DateTime        @updatedAt @map("updated_at")

  secret Secret      @relation(fields: [secretId], references: [id], onDelete: Cascade)
  events TradeRuleEvent[]

  @@index([secretId, status])
  @@index([status])
  @@index([tokenId])
  @@map("trade_rules")
}

model TradeMonitoredPosition {
  id            String   @id @default(cuid())
  secretId      String   @map("secret_id")
  marketId      String   @map("market_id")
  marketSlug    String?  @map("market_slug")
  tokenId       String   @map("token_id")
  side          String
  quantity      Float
  avgEntryPrice Float?   @map("avg_entry_price")
  currentPrice  Float    @map("current_price")
  marketTitle   String?  @map("market_title")
  outcome       String?
  endDate       String?  @map("end_date")
  redeemable    Boolean  @default(false)
  lastUpdatedAt DateTime @map("last_updated_at")
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  secret Secret @relation(fields: [secretId], references: [id], onDelete: Cascade)

  @@unique([secretId, marketId, tokenId, side])
  @@map("trade_monitored_positions")
}

model TradeRuleEvent {
  id        String             @id @default(cuid())
  ruleId    String             @map("rule_id")
  eventType TradeRuleEventType @map("event_type")
  eventData Json               @map("event_data")
  createdAt DateTime           @default(now()) @map("created_at")

  rule TradeRule @relation(fields: [ruleId], references: [id], onDelete: Cascade)

  @@index([ruleId, createdAt])
  @@map("trade_rule_events")
}
```

Also add relations on the `Secret` model:
```prisma
tradeRules             TradeRule[]
tradeMonitoredPositions TradeMonitoredPosition[]
```

Then run `npx prisma migrate dev --name add-trade-manager-models`.

---

## Step 2: Trade Manager Services

Create `src/services/tradeManager/` directory with these files:

### `src/services/tradeManager/types.ts`
Shared types: RuleLike, WorkerStatus, PriceUpdate, etc.

### `src/services/tradeManager/ruleManager.service.ts`
Port from `trade-manager/src/services/ruleManager.service.ts`:
- All methods take `secretId` as first param for scoping
- Uses the Vincent Prisma client (PostgreSQL) instead of SQLite
- Uses `TradeRuleType`/`TradeRuleStatus` enums instead of string comparisons
- `createRule(secretId, input)` — validates with Zod, creates rule, logs event
- `getRules(secretId?, status?)` — filter by secret + status. When called without secretId (by the worker), returns all active rules across all agents
- `getRule(secretId, id)` — get single rule, verify ownership
- `updateRule(secretId, id, data)` — update trigger price
- `cancelRule(secretId, id)` — cancel rule
- `markRuleTriggered(id, txHash?)` — idempotent trigger (no secretId needed, worker uses this)
- `markRuleFailed(id, errorMessage)` — mark failed
- `updateTrailingTrigger(id, newPrice, context?)` — trailing stop adjustment

### `src/services/tradeManager/eventLogger.service.ts`
Port from `trade-manager/src/services/eventLogger.service.ts`:
- `logEvent(ruleId, eventType, eventData)` — writes to `TradeRuleEvent` table
- `getEvents(ruleId?, limit?, offset?)` — query events
- Uses `Json` type for eventData (PostgreSQL native JSON, no manual stringify)

### `src/services/tradeManager/positionMonitor.service.ts`
Port from `trade-manager/src/services/positionMonitor.service.ts`:
- `updatePositions(secretId)` — calls `polymarketSkill.getHoldings(secretId)` directly, upserts `TradeMonitoredPosition` records
- `updateAllPositions()` — finds all distinct secretIds with active rules, calls updatePositions for each
- `getPosition(secretId, marketId, tokenId)` — lookup from DB
- `getCurrentPrice(marketId, tokenId)` — calls `polymarketSkill.getMidpoint(tokenId)` directly (HTTP fallback for when WebSocket price isn't available)

### `src/services/tradeManager/ruleExecutor.service.ts`
Port from `trade-manager/src/services/ruleExecutor.service.ts`:
- `evaluateRule(rule, currentPrice)` — pure logic, same as original
- `executeRule(rule)` — key change: calls `polymarketSkill.placeBet({ secretId: rule.secretId, tokenId, side: 'SELL', amount })` directly instead of HTTP. This enforces policies + creates audit logs.
- `isPermanentFailure()` — adapted to handle `AppError` from polymarketSkill instead of HTTP response codes

### `src/services/tradeManager/polymarketWebSocket.service.ts`
Copy from `trade-manager/src/services/polymarketWebSocket.service.ts` largely unchanged:
- Singleton instance for the whole backend
- Same WebSocket connection to `wss://ws-subscriptions-clob.polymarket.com/ws/market`
- Same subscribe/unsubscribe/reconnect logic
- Same price calculation (mid-price from orderbook)
- Replace pino logger with console.log or whatever the Vincent backend uses

### `src/services/tradeManager/monitoringWorker.ts`
Port from `trade-manager/src/worker/monitoringWorker.ts`:
- **Multi-tenant tick**: fetches ALL active rules across all secrets, groups by tokenId for WebSocket subscription management
- Same circuit breaker logic (5 failures → 60s cooldown)
- Same WebSocket event handling (price → evaluate matching rules immediately)
- Same trailing stop adjustment
- Same idempotent execution guard (`executingRuleIds` Set)
- `updateAllPositions()` calls positionMonitor for each distinct secretId with active rules
- Exports `startTradeMonitoringWorker()` and `stopTradeMonitoringWorker()` functions

### `src/services/tradeManager/index.ts`
Re-exports: `startTradeMonitoringWorker`, `stopTradeMonitoringWorker`, rule manager functions, etc.

---

## Step 3: API Routes

**File:** `src/api/routes/tradeRules.routes.ts`

New route file with endpoints:

| Method | Path | Handler |
|--------|------|---------|
| POST | `/rules` | Create rule (body: ruleType, marketId, tokenId, triggerPrice, action, etc.) |
| GET | `/rules` | List rules for this secret (query: `?status=ACTIVE`) |
| GET | `/rules/:id` | Get single rule |
| PATCH | `/rules/:id` | Update trigger price |
| DELETE | `/rules/:id` | Cancel rule |
| GET | `/rules/events` | Event log (query: `?ruleId=...&limit=100&offset=0`) |
| GET | `/rules/positions` | Monitored positions for this secret |
| GET | `/rules/status` | Worker status (running, circuit breaker, WebSocket state, active rules count) |

Auth uses existing `apiKeyAuthMiddleware` — `req.secret.id` provides the `secretId` for scoping.

**Mount in:** `src/api/routes/polymarket.routes.ts`
```typescript
import tradeRulesRouter from './tradeRules.routes.js';
router.use('/rules', tradeRulesRouter);
```

This produces paths like `POST /api/skills/polymarket/rules`, `GET /api/skills/polymarket/rules/:id`, etc.

---

## Step 4: Worker Lifecycle

**File:** `src/index.ts`

Add to the server startup/shutdown alongside existing workers:

```typescript
import { startTradeMonitoringWorker, stopTradeMonitoringWorker } from './services/tradeManager/index.js';

// In main():
startTradeMonitoringWorker();

// In shutdown():
stopTradeMonitoringWorker();
```

The worker starts on boot, loads all active rules from PostgreSQL, connects the shared WebSocket, and begins monitoring.

---

## Step 5: Configuration

Add optional env vars to `src/utils/env.ts`:

```
TRADE_MANAGER_ENABLED          // default: true
TRADE_MANAGER_POLL_INTERVAL_S  // default: 60
TRADE_MANAGER_WS_ENABLED       // default: true
```

The WebSocket URL is hardcoded as it doesn't change (`wss://ws-subscriptions-clob.polymarket.com/ws/market`).

---

## Files Created/Modified

**New files:**
- `src/services/tradeManager/types.ts`
- `src/services/tradeManager/ruleManager.service.ts`
- `src/services/tradeManager/eventLogger.service.ts`
- `src/services/tradeManager/positionMonitor.service.ts`
- `src/services/tradeManager/ruleExecutor.service.ts`
- `src/services/tradeManager/polymarketWebSocket.service.ts`
- `src/services/tradeManager/monitoringWorker.ts`
- `src/services/tradeManager/index.ts`
- `src/api/routes/tradeRules.routes.ts`

**Modified files:**
- `prisma/schema.prisma` — add 3 models + 2 relations on Secret
- `src/api/routes/polymarket.routes.ts` — mount tradeRules sub-router
- `src/index.ts` — start/stop worker in lifecycle
- `src/utils/env.ts` — add optional trade manager env vars

---

## Verification

1. `npx prisma migrate dev --name add-trade-manager-models` — migration succeeds
2. `npx tsc --noEmit` — no type errors
3. `npm run lint` — no lint errors
4. `npm test` — existing tests still pass
5. Manual E2E: Create a rule via `POST /api/skills/polymarket/rules` with a valid API key, verify it appears in `GET /api/skills/polymarket/rules`, check `GET /api/skills/polymarket/rules/status` shows the worker is running
