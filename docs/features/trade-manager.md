# Trade Manager

The Trade Manager is integrated into the Vincent backend as a service. It manages automated trading rules (stop-loss, take-profit, trailing stop) for Polymarket positions, triggered by price movements. It is multi-tenant — every rule and position is scoped to a `secretId`.

## Architecture

```
AI Agent → Vincent API (/api/skills/polymarket/rules/...) → PostgreSQL
                │
        ┌───────┴────────┐
        │ Trade Manager  │
        │ Worker (in     │──── Polymarket WebSocket
        │ backend process)│     (real-time prices)
        └────────────────┘
```

- **Part of the Vincent backend** — no separate process, no separate database
- **API endpoints** under `/api/skills/polymarket/rules/...` (same auth as Polymarket skill)
- **PostgreSQL** for state (rules, positions, events) via Prisma
- **Background worker** monitors prices via Polymarket WebSocket (with configurable polling fallback)
- Trade execution goes through `polymarketSkill.placeBet()` — full policy enforcement and audit logging

## Core Concepts

### TradeRule

A rule that triggers an action when price conditions are met.

| Field | Description |
|---|---|
| `secretId` | Scoping — which agent's rule this is |
| `ruleType` | `STOP_LOSS`, `TAKE_PROFIT`, `TRAILING_STOP` |
| `marketId` | Polymarket market condition ID |
| `tokenId` | Polymarket outcome token (CLOB token ID) |
| `triggerPrice` | Price threshold that triggers the rule |
| `trailingPercent` | For `TRAILING_STOP` only — percentage below current price |
| `action` | JSON: `{ "type": "SELL_ALL" }` or `{ "type": "SELL_PARTIAL", "amount": N }` |
| `status` | `ACTIVE`, `TRIGGERED`, `CANCELED`, `EXPIRED`, `FAILED` |

### TradeMonitoredPosition

Cached snapshot of positions being watched, updated each poll cycle. Scoped by `secretId`.

### TradeRuleEvent

Append-only audit log of rule evaluations and actions.

## Background Worker

Starts automatically with the Vincent backend. Controlled by environment variables:

| Variable | Default | Description |
|---|---|---|
| `TRADE_MANAGER_ENABLED` | `true` | Enable/disable the worker |
| `TRADE_MANAGER_POLL_INTERVAL_S` | `60` | Polling interval in seconds |
| `TRADE_MANAGER_WS_ENABLED` | `true` | Enable WebSocket price feed |

### Price Monitoring

**Primary: Polymarket WebSocket** — single shared connection subscribes to real-time price updates for all markets with active rules across all agents. Price changes trigger immediate rule evaluation.

**Fallback: Polling** — on each poll tick, the worker fetches positions and prices via HTTP for each agent with active rules.

### Evaluation Loop

On each price update (WebSocket or poll):
1. Fetch all active rules across all agents from PostgreSQL
2. Update monitored positions for each distinct `secretId`
3. For each active rule: evaluate trigger condition against current price
4. If triggered: execute market sell order via `polymarketSkill.placeBet()`
5. Mark rule as triggered atomically (prevents double-execution)
6. Log events

**Trade execution:** Goes through the same `polymarketSkill.placeBet()` pipeline as manual trades. This means full policy enforcement (spending limits, approvals) and audit logging happen automatically.

**Guardrails:**
- Idempotent: rules marked triggered atomically via `updateMany` with status check
- Circuit breaker: pauses after 5+ consecutive failures (60s cooldown)
- Deduplication: `executingRuleIds` Set prevents concurrent execution of the same rule
- Pre-execution checks: verifies market is open, not resolved, position has shares
- Error classification: permanent failures (market closed, insufficient funds) mark rule as `FAILED`; transient failures allow retry

## API Endpoints

All under `/api/skills/polymarket/rules` with the same API key auth as Polymarket.

| Method | Path | Description |
|---|---|---|
| POST | `/rules` | Create a new rule |
| GET | `/rules` | List rules (filter by `?status=ACTIVE`) |
| GET | `/rules/:id` | Get rule details |
| PATCH | `/rules/:id` | Update trigger price |
| DELETE | `/rules/:id` | Cancel a rule |
| GET | `/rules/events` | Event log (filter by `?ruleId=...&limit=100&offset=0`) |
| GET | `/rules/positions` | List monitored positions for this agent |
| GET | `/rules/status` | Worker status (running, circuit breaker, WebSocket, active rules count) |

## Planned: Harness Layer

Alert intake + durable queue for routing alerts into either direct transaction execution or agent wakeups:

- `POST /api/alerts` — ingest alerts with idempotency key
- Alert routing creates `HarnessJob` records
- `EXECUTE_TXN` jobs call Vincent skills directly
- `WAKE_AGENT` jobs call the local OpenClaw gateway to wake the agent
- Retry with backoff, max attempts, concurrency cap

## Planned: Strategy Layer

Higher-level abstraction above individual rules:

```
Strategy (template + thesis + risk profile)
  └─ owns N TradeRules (each with SL/TP)
       └─ each rule runs through: trigger → evaluator → execute/hold/adjust
```

Two evaluator types:
- **auto** — execute immediately (mechanical strategies)
- **agent** — wake LLM to evaluate against thesis before deciding (thesis-driven strategies)

## Integration with Vincent

The trade manager is **part of** the Vincent backend:

- Rules stored in the same PostgreSQL database as all other Vincent data
- Trade execution uses `polymarketSkill.placeBet()` directly (no HTTP round-trip)
- Policy enforcement and audit logging happen automatically
- Multi-tenant: each agent only sees/manages their own rules via `secretId` scoping

## Files

```
src/services/tradeManager/
├── types.ts                        # Shared types (RuleLike, WorkerStatus, PriceUpdate)
├── ruleManager.service.ts          # Rule CRUD (multi-tenant, Zod validation)
├── eventLogger.service.ts          # Event logging (PostgreSQL native JSON)
├── positionMonitor.service.ts      # Position sync from polymarketSkill.getHoldings()
├── ruleExecutor.service.ts         # Rule evaluation + trade execution
├── polymarketWebSocket.service.ts  # Shared WebSocket connection to Polymarket
├── monitoringWorker.ts             # Background worker (start/stop lifecycle)
└── index.ts                        # Re-exports

src/api/routes/tradeRules.routes.ts # API route handlers (mounted in polymarket.routes.ts)

prisma/schema.prisma                # TradeRule, TradeMonitoredPosition, TradeRuleEvent models
```

The standalone `trade-manager/` directory contains the original standalone implementation (historical reference) and test scripts.
