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
  "logLevel": "info",
  "dbPath": "~/.openclaw/trade-manager.db"
}
```

The Vincent API key is auto-configured during OpenClaw provisioning (read from `~/.openclaw/credentials/agentwallet/`).

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
│   │   │   └── health.routes.ts     # Health/status endpoints
│   │   └── middleware/
│   │       └── errorHandler.ts
│   ├── services/
│   │   ├── ruleManager.service.ts      # Rule CRUD business logic
│   │   ├── positionMonitor.service.ts  # Fetch/cache positions & prices
│   │   ├── ruleExecutor.service.ts     # Execute trades when rules trigger
│   │   ├── eventLogger.service.ts      # Log events to Prisma
│   │   └── vincentClient.service.ts    # Vincent API client (Polymarket calls)
│   ├── worker/
│   │   └── monitoringWorker.ts      # Background loop
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
