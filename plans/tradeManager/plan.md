# Trade Manager — Revised Plan

## Goal

Build a standalone **Trade Manager** app that runs on each user's OpenClaw VPS and manages automated trading rules (stop-loss, take-profit) for Polymarket positions. The OpenClaw agent interacts with it via a local HTTP API.

**MVP Focus**: Stop-loss and take-profit orders for Polymarket positions, triggered by price movements.

---

## Architecture (Standalone App on Each VPS)

- **Trade Manager Daemon**: Separate Node.js app that runs on each OpenClaw VPS
  - Long-running process supervised by systemd
  - Local HTTP API on `localhost:PORT` for agent communication
  - Local SQLite database for state (rules, positions, events)
  - Reuses Vincent Polymarket wallet credentials (API key stored on VPS)
- **Harness Layer (Alerts + Wakeups)**: Local alert intake + durable queue to route alerts into either
  - direct transaction execution (via Vincent wallet skills), or
  - agent wakeups for reasoning/approval
- **OpenClaw Agent**: Calls local trade manager API when user requests via Telegram
- **Deployment**: Auto-installed on every OpenClaw VPS provisioning
- **Credentials**: Uses existing Polymarket wallet secret (API key) from Vincent

---

## User Flow (MVP)

1. **User has OpenClaw agent** with Polymarket wallet configured
2. User chats via Telegram: *"Set a stop loss at $0.40 for my Trump Yes position"*
3. Agent calls local trade manager API:
   ```bash
   curl -X POST http://localhost:19000/api/rules \
     -H "Content-Type: application/json" \
     -d '{
       "marketId": "...",
       "tokenId": "...",
       "ruleType": "STOP_LOSS",
       "triggerPrice": 0.40,
       "action": { "type": "SELL_ALL" }
     }'
   ```
4. Trade manager stores rule and starts monitoring
5. When price hits $0.40, trade manager executes market sell via Vincent Polymarket API
6. Rule is marked as triggered, agent notifies user

---

## Alert + Wake Flow (Harness)

1. An alert source (skills, webhook, cron) calls `POST /api/alerts` with an idempotency key.
2. Trade manager stores an `AlertEvent`, evaluates routing, and enqueues a durable `HarnessJob`.
3. The harness worker processes the job:
   - **EXECUTE_TXN**: call Vincent wallet/venue skill and record `ExecutionAttempt` + response.
   - **WAKE_AGENT**: call the local OpenClaw gateway/CLI with a correlation ID.
4. Results are logged and surfaced via `GET /api/alerts` and `GET /api/jobs`.

---

## Core Concepts

### TradeRule

A rule that triggers an action when conditions are met.

- `id` (cuid)
- `ruleType`: `STOP_LOSS` | `TAKE_PROFIT` | `TRAILING_STOP` (v2)
- `marketId`: Polymarket market condition ID
- `tokenId`: Polymarket outcome token (CLOB token ID)
- `side`: `BUY` | `SELL` (which position this applies to)
- `triggerPrice`: Decimal (price that triggers the rule)
- `trailingPercent`: Decimal (nullable, for trailing stops in v2)
- `action`: JSON (e.g. `{ "type": "SELL_ALL" }` or `{ "type": "SELL_PARTIAL", "amount": 100 }`)
- `status`: `ACTIVE` | `TRIGGERED` | `CANCELED` | `EXPIRED` | `FAILED`
- `triggeredAt`: DateTime (nullable)
- `triggerTxHash`: String (nullable, hash/ID of executed order)
- `errorMessage`: String (nullable, if failed)
- `createdAt`, `updatedAt`

### MonitoredPosition (cached state)

Snapshot of positions being monitored (to avoid hitting Polymarket API on every poll).

- `id` (cuid)
- `marketId`
- `tokenId`
- `side`: `BUY` | `SELL`
- `quantity`: Decimal (number of shares)
- `avgEntryPrice`: Decimal (nullable)
- `currentPrice`: Decimal (last known)
- `lastUpdatedAt`: DateTime
- `createdAt`, `updatedAt`

### RuleEvent (audit log)

Append-only log of rule evaluations and actions.

- `id` (cuid)
- `ruleId`
- `eventType`: `RULE_CREATED` | `RULE_EVALUATED` | `RULE_TRIGGERED` | `RULE_CANCELED` | `ACTION_EXECUTED` | `ACTION_FAILED`
- `eventData`: JSON (snapshot of relevant data: price, position, etc.)
- `createdAt`

---

### AlertEvent (ingress)

Inbound alert payloads that can trigger transactions or wake the agent.

- `id` (cuid)
- `source`: String (e.g. `strategy-engine`, `webhook`, `cron`)
- `alertType`: String (free-form)
- `mode`: `EXECUTE_TXN` | `WAKE_AGENT` | `IGNORE`
- `idempotencyKey`: String (unique per source + alert)
- `payload`: JSON
- `status`: `RECEIVED` | `QUEUED` | `PROCESSED` | `FAILED` | `IGNORED`
- `createdAt`, `updatedAt`

### HarnessJob (durable queue)

Queue item that drives execution or wake dispatch.

- `id` (cuid)
- `alertId`: FK -> AlertEvent
- `jobType`: `EXECUTE_TXN` | `WAKE_AGENT`
- `status`: `PENDING` | `RUNNING` | `SUCCEEDED` | `FAILED`
- `attempts`, `maxAttempts`
- `lastError`, `lastAttemptAt`
- `createdAt`, `updatedAt`

### ExecutionAttempt (transaction audit)

- `id` (cuid)
- `alertId`: FK -> AlertEvent (nullable for rule-triggered actions)
- `ruleId`: FK -> TradeRule (nullable for alert-triggered actions)
- `status`: `SUBMITTED` | `CONFIRMED` | `FAILED`
- `request`: JSON (order payload)
- `response`: JSON (venue response)
- `txHash` / `orderId`: String (nullable)
- `createdAt`

---

## Local API Endpoints (MVP)

All endpoints listen on `localhost:19000` (or configurable port).

### Health & Status

- `GET /health` — Health check (returns `{ status: "ok", version: "..." }`)
- `GET /status` — Worker status (running, last sync time, active rules count)

### Rule Management

- `POST /api/rules` — Create a new rule
  ```json
  {
    "marketId": "0x123...",
    "tokenId": "456",
    "ruleType": "STOP_LOSS",
    "triggerPrice": 0.40,
    "action": { "type": "SELL_ALL" }
  }
  ```
- `GET /api/rules` — List all rules (optionally filter by `?status=ACTIVE`)
- `GET /api/rules/:id` — Get rule details
- `DELETE /api/rules/:id` — Cancel a rule
- `PATCH /api/rules/:id` — Update trigger price (if active)

### Positions & Monitoring

- `GET /api/positions` — List monitored positions with current prices
- `GET /api/events?ruleId=...` — Get event log for a rule (or all events if no filter)

### Alerts & Harness

- `POST /api/alerts` — Ingest an alert (idempotent via `Idempotency-Key` header or body field)
  ```json
  {
    "source": "strategy-engine",
    "alertType": "STOP_TRIGGERED",
    "mode": "EXECUTE_TXN",
    "idempotencyKey": "alert-123",
    "payload": { "marketId": "...", "tokenId": "...", "action": "SELL_ALL" }
  }
  ```
- `GET /api/alerts` — List alerts (filter by `?status=QUEUED|PROCESSED|FAILED`)
- `GET /api/alerts/:id` — Alert details + routing result
- `GET /api/jobs` — List harness jobs (filter by `?status=PENDING|FAILED`)
- `GET /api/executions` — List execution attempts (filter by `?alertId=...` or `?ruleId=...`)

---

## Background Worker (Main Loop)

Runs continuously in the same process as the HTTP API.

**Main Loop** (every 15 seconds):

1. Fetch all active rules from SQLite
2. Fetch current positions from Vincent Polymarket API (using stored wallet API key)
3. Fetch current orderbook/prices for relevant markets
4. Update `monitored_positions` cache
5. For each active rule:
   - Evaluate: is trigger price met?
   - If yes:
     - Execute action via Vincent Polymarket API (place sell order)
     - Update rule status to `TRIGGERED` atomically
     - Log `ACTION_EXECUTED` or `ACTION_FAILED` event
6. Log `RULE_EVALUATED` events for audit trail

**Guardrails**:
- Rate limiting: don't poll Vincent/Polymarket too frequently (respect API limits)
- Idempotency: mark rules as triggered atomically (use DB transaction)
- Error handling: log failures but don't crash; retry with exponential backoff
- Circuit breaker: pause polling if Vincent API is down (5+ consecutive failures)

### Harness Workers (Alerts + Wakeups)

Runs alongside the rule monitor loop.

1. Fetch `AlertEvent` items in `RECEIVED` state and enqueue `HarnessJob` records.
2. Process `HarnessJob` queue with a lease/lock:
   - **EXECUTE_TXN**: call the appropriate Vincent skill endpoint and record `ExecutionAttempt`.
   - **WAKE_AGENT**: call local OpenClaw gateway/CLI with a correlation ID for the alert.
3. Update `AlertEvent` + `HarnessJob` status and record errors/attempt counts.

**Harness Guardrails**:
- Idempotency via unique `idempotencyKey`
- Retry with backoff and max attempts per job
- Concurrency cap (single worker by default to avoid double execution)

---

## Database Schema (Prisma + SQLite)

**File**: `~/.openclaw/trade-manager.db` (or configurable path)

Using **Prisma ORM** for type-safe database access and managed migrations (consistent with Vincent project).

### Prisma Schema

**File**: `prisma/schema.prisma`

```prisma
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model TradeRule {
  id               String      @id @default(cuid())
  ruleType         String      // STOP_LOSS, TAKE_PROFIT, TRAILING_STOP
  marketId         String
  tokenId          String
  side             String      // BUY or SELL
  triggerPrice     Float
  trailingPercent  Float?
  action           String      // JSON: {"type": "SELL_ALL"} or {"type": "SELL_PARTIAL", "amount": 100}
  status           String      @default("ACTIVE") // ACTIVE, TRIGGERED, CANCELED, EXPIRED, FAILED
  triggeredAt      DateTime?
  triggerTxHash    String?
  errorMessage     String?
  createdAt        DateTime    @default(now())
  updatedAt        DateTime    @updatedAt

  events           RuleEvent[]

  @@index([status, updatedAt])
  @@map("trade_rules")
}

model MonitoredPosition {
  id             String   @id @default(cuid())
  marketId       String
  tokenId        String
  side           String   // BUY or SELL
  quantity       Float
  avgEntryPrice  Float?
  currentPrice   Float
  lastUpdatedAt  DateTime
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@unique([marketId, tokenId])
  @@index([marketId, tokenId])
  @@map("monitored_positions")
}

model RuleEvent {
  id          String    @id @default(cuid())
  ruleId      String
  eventType   String    // RULE_CREATED, RULE_EVALUATED, RULE_TRIGGERED, etc.
  eventData   String    // JSON
  createdAt   DateTime  @default(now())

  rule        TradeRule @relation(fields: [ruleId], references: [id], onDelete: Cascade)

  @@index([ruleId, createdAt])
  @@map("rule_events")
}

model AlertEvent {
  id              String   @id @default(cuid())
  source          String
  alertType       String
  mode            String   // EXECUTE_TXN, WAKE_AGENT, IGNORE
  idempotencyKey  String
  payload         String   // JSON
  status          String   @default("RECEIVED") // RECEIVED, QUEUED, PROCESSED, FAILED, IGNORED
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  jobs            HarnessJob[]
  executions      ExecutionAttempt[]

  @@unique([source, idempotencyKey])
  @@index([status, createdAt])
  @@map("alert_events")
}

model HarnessJob {
  id            String   @id @default(cuid())
  alertId       String
  jobType       String   // EXECUTE_TXN, WAKE_AGENT
  status        String   @default("PENDING") // PENDING, RUNNING, SUCCEEDED, FAILED
  attempts      Int      @default(0)
  maxAttempts   Int      @default(5)
  lastError     String?
  lastAttemptAt DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  alert         AlertEvent @relation(fields: [alertId], references: [id], onDelete: Cascade)

  @@index([status, updatedAt])
  @@map("harness_jobs")
}

model ExecutionAttempt {
  id         String   @id @default(cuid())
  alertId    String?
  ruleId     String?
  status     String   // SUBMITTED, CONFIRMED, FAILED
  request    String   // JSON
  response   String?  // JSON
  txHash     String?
  createdAt  DateTime @default(now())

  alert      AlertEvent? @relation(fields: [alertId], references: [id], onDelete: Cascade)
  rule       TradeRule?  @relation(fields: [ruleId], references: [id], onDelete: SetNull)

  @@index([alertId, createdAt])
  @@index([ruleId, createdAt])
  @@map("execution_attempts")
}

model Config {
  key   String @id
  value String

  @@map("config")
}
```

### Migrations

Migrations are managed via `npx prisma migrate dev` during development and `npx prisma migrate deploy` in production.

---

## Configuration

**File**: `~/.openclaw/trade-manager.json` (or env vars)

```json
{
  "port": 19000,
  "vincentApiUrl": "https://heyvincent.ai",
  "vincentApiKey": "ssk_...", // Polymarket wallet API key
  "pollIntervalSeconds": 15,
  "jobPollIntervalSeconds": 2,
  "maxJobAttempts": 5,
  "alertsSharedSecret": "oc_alerts_...",
  "agentWakeUrl": "http://localhost:18000/api/wake",
  "agentWakeToken": "oc_wake_...",
  "logLevel": "info",
  "databaseUrl": "file:~/.openclaw/trade-manager.db"
}
```

The Vincent API key is auto-configured during OpenClaw provisioning (read from `~/.openclaw/credentials/agentwallet/`).
`alertsSharedSecret` secures alert ingestion, and `agentWakeUrl`/`agentWakeToken` are used by the harness worker to wake the local agent.

---

## Deployment (OpenClaw VPS)

### Installation

During OpenClaw provisioning, after installing OpenClaw binary:

1. Download trade manager binary (or npm install from registry)
2. Create systemd service: `openclaw-trade-manager.service`
3. Create config file at `~/.openclaw/trade-manager.json`
4. Start service: `systemctl --user enable --now openclaw-trade-manager`

### Systemd Service

**File**: `~/.config/systemd/user/openclaw-trade-manager.service`

```ini
[Unit]
Description=OpenClaw Trade Manager
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/trade-manager start
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target
```

### Updates

Trade manager can auto-update via:
- `trade-manager update` command (checks for new version, downloads, restarts)
- Or manual: `npm install -g @openclaw/trade-manager@latest && systemctl --user restart openclaw-trade-manager`

---

## Project Structure

```
trade-manager/
├── prisma/
│   ├── schema.prisma           # Prisma schema definition
│   └── migrations/             # Auto-generated migration files
├── src/
│   ├── index.ts                # Main entry point (start HTTP server + worker)
│   ├── api/
│   │   ├── routes/
│   │   │   ├── rules.routes.ts      # Rule CRUD endpoints
│   │   │   ├── positions.routes.ts  # Position endpoints
│   │   │   ├── events.routes.ts     # Event log endpoints
│   │   │   ├── alerts.routes.ts     # Alert ingestion endpoints
│   │   │   ├── jobs.routes.ts       # Harness job status endpoints
│   │   │   ├── executions.routes.ts # Execution attempt endpoints
│   │   │   └── health.routes.ts     # Health/status endpoints
│   │   └── middleware/
│   │       └── errorHandler.ts
│   ├── services/
│   │   ├── ruleManager.service.ts      # Rule CRUD business logic
│   │   ├── positionMonitor.service.ts  # Fetch/cache positions & prices
│   │   ├── ruleExecutor.service.ts     # Execute trades when rules trigger
│   │   ├── eventLogger.service.ts      # Log events to Prisma
│   │   ├── alertRouter.service.ts      # Route alerts to exec or wake
│   │   ├── harnessQueue.service.ts     # Durable queue helpers
│   │   ├── wakeDispatcher.service.ts   # Wake OpenClaw agent
│   │   ├── executionRecorder.service.ts# Transaction audit records
│   │   └── vincentClient.service.ts    # Vincent API client (Polymarket calls)
│   ├── worker/
│   │   ├── monitoringWorker.ts      # Background loop
│   │   └── harnessWorker.ts         # Alerts + wakeups worker
│   ├── db/
│   │   └── client.ts                # Prisma client singleton
│   ├── config/
│   │   └── config.ts                # Load config from file/env
│   └── utils/
│       ├── logger.ts
│       └── errors.ts
├── package.json
├── tsconfig.json
└── README.md
```

---

## Integration with Vincent

The trade manager doesn't need changes to Vincent backend. It uses Vincent's existing Polymarket API as a client:

1. **Authentication**: Uses Polymarket wallet API key (stored on VPS during provisioning)
2. **Trade execution**: Calls `POST https://heyvincent.ai/api/skills/polymarket/bet`
3. **Position fetching**: Calls `GET https://heyvincent.ai/api/skills/polymarket/positions`
4. **Price fetching**: Calls `GET https://heyvincent.ai/api/skills/polymarket/markets?marketId=...`
5. **Alert-driven execution**: Uses Vincent wallet/venue skills to place transactions when alerts are routed to `EXECUTE_TXN`

All existing Vincent policies (spending limits, approvals) are still enforced server-side.

---

## Agent Skill Definition

**File**: `skills/trade-manager/SKILL.md` (added to Vincent repo, published to agent)

The agent skill documentation tells the OpenClaw agent how to call the local trade manager API.

```markdown
# Trade Manager

Automated trading rules (stop-loss, take-profit) for Polymarket positions.

## Quick Start

### Set a Stop Loss

POST http://localhost:19000/api/rules
{
  "marketId": "...",
  "tokenId": "...",
  "ruleType": "STOP_LOSS",
  "triggerPrice": 0.40,
  "action": { "type": "SELL_ALL" }
}

### List Active Rules

GET http://localhost:19000/api/rules?status=ACTIVE

### Cancel a Rule

DELETE http://localhost:19000/api/rules/:id
```

Extend the skill doc to include `POST /api/alerts` (with idempotency + auth header) and `GET /api/jobs` for harness status.

---


## Implementation Progress (through Phase 6)

### Completed

- Built `trade-manager/` standalone app scaffold with TypeScript + Prisma + SQLite, including initial migration and Prisma client lifecycle helpers.
- Implemented config loading from `~/.openclaw/trade-manager.json`, env fallback, and agentwallet API-key file fallback.
- Implemented core services: Vincent API client (retry/backoff), rule manager, position monitor, event logger, and rule executor.
- Implemented local HTTP API (`/health`, `/status`, `/api/rules`, `/api/positions`, `/api/events`) with Zod validation + centralized error handling.
- Implemented monitoring worker loop with evaluation logic for STOP_LOSS and TAKE_PROFIT, trigger execution, event logging, and circuit breaker state.
- Added entrypoint + CLI, basic unit route/worker tests, and deployment assets (systemd unit + installer script + README + skill doc).
- Integrated OpenClaw provisioning script to install/start trade manager and seed trade-manager config on VPS setup.
- Harness layer (alerts + wakeups + durable queue) is planned in Phase 7 and not implemented yet.

### Learnings / Changes from original draft

- OpenClaw VPS provisioning currently uses system-level services (`/etc/systemd/system`) for reliability, so trade-manager integration follows the same pattern during bootstrap.
- Config shape is expressed as `databaseUrl` for Prisma compatibility, replacing the earlier informal `dbPath` field in runtime code.
- Worker status endpoint now includes circuit-breaker telemetry to make API outages observable without log scraping.

---

## Non-Goals (MVP)

Explicitly deferred to later phases:

- ❌ Paper trading / simulation mode
- ❌ Advanced strategies (trailing stops, grid, DCA)
- ❌ Multi-market portfolio optimization
- ❌ News/Twitter triggers
- ❌ AI-suggested SL/TP levels
- ❌ Frontend UI (agent chat is sufficient)
- ❌ Multi-user support (one instance per VPS)
- ❌ Additional host-side risk gating beyond SL/TP and account-level kill switch (handled elsewhere)

---

## Acceptance Criteria (MVP)

- ✅ Trade manager runs as systemd service on OpenClaw VPS
- ✅ OpenClaw agent can create stop-loss rule via local API
- ✅ OpenClaw agent can create take-profit rule via local API
- ✅ Background worker polls positions and prices every 15 seconds
- ✅ When trigger price is met, worker executes trade via Vincent Polymarket API
- ✅ Rules are marked as triggered and not re-executed (idempotent)
- ✅ All rule evaluations and actions are logged to SQLite
- ✅ Agent can list active rules and see their status
- ✅ Agent can cancel an active rule before it triggers
- ✅ Vincent policies (spending limits, approval) are still enforced
- ✅ Worker gracefully handles Vincent API failures and retries with backoff
- ✅ Trade manager auto-starts on VPS boot
- ✅ Logs are accessible via `journalctl --user -u openclaw-trade-manager`
- ✅ Alerts can be ingested via `POST /api/alerts` with idempotency protection
- ✅ Alert routing creates durable `HarnessJob` records for execution or wakeups
- ✅ Alert-driven transactions record `ExecutionAttempt` with request/response
- ✅ Agent wakeups are dispatched with retry/backoff and visible job status
- ✅ Alert/job/execution status is queryable via API endpoints
- ✅ Alert ingestion is secured with a shared secret/token

---

## Future Enhancements (Post-MVP)

- **Trailing stops**: adjust trigger price as market moves in favor
- **AI suggestions**: agent suggests optimal SL/TP levels based on volatility/history
- **Paper trading**: test rules without real money
- **Advanced triggers**: time-based, volume-based, correlation-based
- **Multi-position coordination**: close all positions in a market, hedge across markets
- **Data source integration**: trigger rules based on news/Twitter sentiment
- **Telegram notifications**: proactive alerts when rules trigger (optional)
- **Web UI**: local web interface on VPS for non-technical users
