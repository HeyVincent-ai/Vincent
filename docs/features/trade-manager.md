# Trade Manager

The Trade Manager is a standalone Node.js app that runs on each OpenClaw VPS. It manages automated trading rules (stop-loss, take-profit) for Polymarket positions, triggered by price movements.

## Architecture

```
User (Telegram) → OpenClaw Agent → Trade Manager (localhost:19000) → Vincent API
                                        │
                                   ┌────┴────┐
                                   │ SQLite  │
                                   │ Database│
                                   └─────────┘
```

- **Separate process** from OpenClaw, supervised by systemd
- **Local HTTP API** on `localhost:19000`
- **SQLite database** for state (rules, positions, events)
- **Background worker** monitors prices via Polymarket websockets (with 15-second polling as fallback)
- Communicates with Vincent backend as a REST client using the Polymarket wallet API key

## Core Concepts

### TradeRule

A rule that triggers an action when price conditions are met.

| Field | Description |
|---|---|
| `ruleType` | `STOP_LOSS`, `TAKE_PROFIT`, `TRAILING_STOP` (v2) |
| `marketId` | Polymarket market condition ID |
| `tokenId` | Polymarket outcome token (CLOB token ID) |
| `triggerPrice` | Price threshold that triggers the rule |
| `action` | JSON: `{ "type": "SELL_ALL" }` or `{ "type": "SELL_PARTIAL", "amount": 100 }` |
| `status` | `ACTIVE`, `TRIGGERED`, `CANCELED`, `EXPIRED`, `FAILED` |

### MonitoredPosition

Cached snapshot of positions being watched, updated each poll cycle.

### RuleEvent

Append-only audit log of rule evaluations and actions.

## Background Worker

Runs continuously in the same process as the HTTP API.

### Price Monitoring

**Primary: Polymarket websockets** — subscribes to real-time price updates for all markets with active rules. Price changes trigger immediate rule evaluation.

**Fallback: Polling (every 15 seconds)** — if the websocket disconnects or as a safety net, the worker falls back to polling positions and prices from the Vincent Polymarket API on a 15-second interval.

### Evaluation Loop

On each price update (websocket or poll):
1. Fetch all active rules from SQLite
2. Update monitored positions cache
3. For each active rule: evaluate trigger condition against current price
4. If triggered: execute trade via Vincent Polymarket API
5. Mark rule as triggered atomically
6. Log events

**Guardrails:**
- Idempotent: rules marked triggered in DB transaction
- Circuit breaker: pauses polling after 5+ consecutive API failures
- Error handling: logs failures, doesn't crash, retries with backoff
- Rate limiting: respects Polymarket/Vincent API limits

## Local API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check |
| GET | `/status` | Worker status, active rule count, circuit breaker state |
| POST | `/api/rules` | Create a new rule |
| GET | `/api/rules` | List rules (filter by `?status=ACTIVE`) |
| GET | `/api/rules/:id` | Get rule details |
| DELETE | `/api/rules/:id` | Cancel a rule |
| PATCH | `/api/rules/:id` | Update trigger price |
| GET | `/api/positions` | List monitored positions with prices |
| GET | `/api/events` | Event log (filter by `?ruleId=...`) |

## Planned: Harness Layer (Phase 7)

Alert intake + durable queue for routing alerts into either direct transaction execution or agent wakeups:

- `POST /api/alerts` — ingest alerts with idempotency key
- Alert routing creates `HarnessJob` records
- `EXECUTE_TXN` jobs call Vincent skills directly
- `WAKE_AGENT` jobs call the local OpenClaw gateway to wake the agent
- Retry with backoff, max attempts, concurrency cap

### Planned Data Models

- **AlertEvent** — inbound alert payloads
- **HarnessJob** — durable queue items (EXECUTE_TXN or WAKE_AGENT)
- **ExecutionAttempt** — transaction audit records

## Planned: Strategy Layer (Phases 10-15)

Higher-level abstraction above individual rules:

```
Strategy (template + thesis + risk profile)
  └─ owns N TradeRules (each with SL/TP)
       └─ each rule runs through: trigger → evaluator → execute/hold/adjust
```

Two evaluator types:
- **auto** — execute immediately (mechanical strategies)
- **agent** — wake LLM to evaluate against thesis before deciding (thesis-driven strategies)

Strategy templates: mean-reversion, arbitrage, breakout, dip-buying, attention-breakout, event-driven, sentiment-shift, and more.

## Deployment

Auto-installed on every OpenClaw VPS during provisioning:

1. Trade manager binary/package installed
2. Systemd service created: `openclaw-trade-manager.service`
3. Config written to `~/.openclaw/trade-manager.json`
4. Service started and enabled

**Config:**
```json
{
  "port": 19000,
  "vincentApiUrl": "https://heyvincent.ai",
  "vincentApiKey": "ssk_...",
  "pollIntervalSeconds": 15,
  "databaseUrl": "file:~/.openclaw/trade-manager.db"
}
```

Vincent API key auto-read from `~/.openclaw/credentials/agentwallet/`.

## Integration with Vincent

The trade manager is a **client** of Vincent's existing Polymarket API:

- `POST /api/skills/polymarket/bet` — execute trades
- `GET /api/skills/polymarket/open-orders` — fetch open orders
- `GET /api/skills/polymarket/markets` — fetch prices

All Vincent policies (spending limits, approvals) are still enforced server-side. The trade manager does not bypass any security controls.

## Files

```
trade-manager/
├── src/
│   ├── index.ts                    # Entry point
│   ├── api/routes/                 # HTTP API routes
│   ├── services/
│   │   ├── ruleManager.service.ts  # Rule CRUD
│   │   ├── positionMonitor.service.ts # Position/price fetching
│   │   ├── ruleExecutor.service.ts # Trade execution
│   │   ├── eventLogger.service.ts  # Event logging
│   │   └── vincentClient.service.ts # Vincent API client
│   ├── worker/monitoringWorker.ts  # Background loop
│   ├── db/client.ts                # Prisma client (SQLite)
│   └── config/config.ts            # Config loader
├── prisma/schema.prisma            # SQLite schema
├── systemd/                        # Service file
├── skills/trade-manager/SKILL.md   # Agent skill docs
└── package.json
```
