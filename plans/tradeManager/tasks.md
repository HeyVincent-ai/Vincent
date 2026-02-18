# Trade Manager Implementation Tasks

## Overview

This task list builds a **standalone Node.js app** that runs on each OpenClaw VPS. The app provides a local HTTP API for the OpenClaw agent to manage automated trading rules.

**MVP Goal**: Stop-loss and take-profit orders triggered by price movements, with user interacting via Telegram chat with their agent.

**Key Architecture**:

- Standalone Node.js app (separate from Vincent)
- Runs on each OpenClaw VPS (localhost API)
- Prisma ORM with SQLite for local state (consistent with Vincent)
- Durable alert intake + queue to route alerts into execution or agent wakeups
- Calls Vincent Polymarket API to execute trades
- Agent interacts via local HTTP API

---

## Phase 1: Project Setup & Database

### 1.1 Initialize Project

- [x] Create new directory: `trade-manager/`
- [x] Initialize package.json: `npm init -y`
- [x] Install core dependencies:
  - `express` (HTTP API)
  - `@prisma/client` (Prisma ORM client)
  - `zod` (validation)
  - `axios` (Vincent API client)
  - `pino` (logging)
- [x] Install dev dependencies:
  - `prisma` (Prisma CLI)
  - `typescript`, `@types/node`, `@types/express`
  - `vitest` (testing)
  - `tsx` (dev server)
- [x] Configure TypeScript (`tsconfig.json`):
  - `"type": "module"` in package.json
  - `"module": "NodeNext"`, `"moduleResolution": "NodeNext"`
  - `"strict": true`
- [x] Add scripts to package.json:
  - `"dev": "tsx watch src/index.ts"`
  - `"build": "prisma generate && tsc"`
  - `"test": "vitest"`
  - `"start": "node dist/index.js"`
  - `"db:migrate": "prisma migrate dev"`
  - `"db:deploy": "prisma migrate deploy"`
  - `"db:studio": "prisma studio"`

### 1.2 Prisma Database Setup

- [x] Initialize Prisma: `npx prisma init --datasource-provider sqlite`
- [x] Create `prisma/schema.prisma`:
  - Define TradeRule model (id, ruleType, marketId, tokenId, side, triggerPrice, trailingPercent, action, status, triggeredAt, triggerTxHash, errorMessage, timestamps)
  - Define MonitoredPosition model (id, marketId, tokenId, side, quantity, avgEntryPrice, currentPrice, lastUpdatedAt, timestamps)
  - Define RuleEvent model (id, ruleId, eventType, eventData, createdAt) with relation to TradeRule
  - Define Config model (key, value)
  - Add indexes as specified in plan
  - Add @@map directives for snake_case table names
- [x] Run initial migration: `npx prisma migrate dev --name init`
- [x] Create `src/db/client.ts`:
  - Export Prisma client singleton
  - Handle connection lifecycle
  - Add graceful shutdown handler

### 1.3 Configuration Management

- [x] Create `src/config/config.ts`:
  - Load config from `~/.openclaw/trade-manager.json`
  - Fallback to env vars
  - Load Vincent API key from `~/.openclaw/credentials/agentwallet/`
  - Define config schema with Zod
  - Export typed config object
- [x] Create default config template
- [x] Add validation for required fields (vincentApiKey, vincentApiUrl)

**Milestone**: Prisma schema defined, migrations run successfully, config loading works.

---

## Phase 2: Core Services (Business Logic)

### 2.1 Vincent API Client

- [x] Create `src/services/vincentClient.service.ts`:
  - `getPositions()` — GET /api/skills/polymarket/positions
  - `getMarketPrice(marketId)` — GET /api/skills/polymarket/markets?marketId=...
  - `placeBet(input)` — POST /api/skills/polymarket/bet
  - `getBalance()` — GET /api/skills/polymarket/balance
  - Error handling with retry logic
  - Rate limiting to respect Vincent API limits

### 2.2 Rule Manager Service

- [x] Create `src/services/ruleManager.service.ts`:
  - `createRule(input)` — validate and insert rule
  - `getRules(filters?)` — query rules with optional status filter
  - `getRule(id)` — get single rule
  - `updateRule(id, data)` — update trigger price
  - `cancelRule(id)` — mark as CANCELED
  - `markRuleTriggered(id, txHash)` — atomic update to TRIGGERED status
- [x] Add Zod validation schemas for rule inputs
- [x] Add business logic validation:
  - Ensure triggerPrice is valid (0 < price < 1)
  - Ensure action is valid (SELL_ALL or SELL_PARTIAL with amount)

### 2.3 Position Monitor Service

- [x] Create `src/services/positionMonitor.service.ts`:
  - `updatePositions()` — fetch from Vincent API and upsert to DB
  - `getPosition(marketId, tokenId)` — query cached position
  - `getCurrentPrice(marketId, tokenId)` — fetch latest price from Vincent
  - `updatePositionPrice(marketId, tokenId, price)` — update cache

### 2.4 Event Logger Service

- [x] Create `src/services/eventLogger.service.ts`:
  - `logEvent(ruleId, eventType, eventData)` — append-only log using Prisma
  - `getEvents(ruleId?, limit?)` — query events via Prisma
  - Define event type schemas with Zod

### 2.5 Rule Executor Service

- [x] Create `src/services/ruleExecutor.service.ts`:
  - `executeRule(rule)` — orchestrate trade execution
  - `evaluateRule(rule, currentPrice)` — check if trigger condition met
  - Handle SELL_ALL action (place market sell via Vincent API)
  - Handle SELL_PARTIAL action (v2, defer if not needed for MVP)
  - Atomic rule status update (prevent double-execution)
  - Error handling and retry logic

**Milestone**: All core business logic implemented and tested.

---

## Phase 3: HTTP API (Agent Interface)

### 3.1 Express App Setup

- [x] Create `src/api/app.ts`:
  - Initialize Express app
  - Add JSON body parser
  - Add error handling middleware
  - Add request logging middleware
  - Export app instance

### 3.2 Route Handlers

- [x] Create `src/api/routes/health.routes.ts`:
  - `GET /health` — returns `{ status: "ok", version: "..." }`
  - `GET /status` — returns worker status, active rules count, last sync time
- [x] Create `src/api/routes/rules.routes.ts`:
  - `POST /api/rules` — create rule
  - `GET /api/rules` — list rules (with optional ?status= filter)
  - `GET /api/rules/:id` — get rule details
  - `PATCH /api/rules/:id` — update trigger price
  - `DELETE /api/rules/:id` — cancel rule
- [x] Create `src/api/routes/positions.routes.ts`:
  - `GET /api/positions` — list monitored positions with current prices
- [x] Create `src/api/routes/events.routes.ts`:
  - `GET /api/events` — get event log (with optional ?ruleId= filter)
- [x] Wire up all routes in `src/api/app.ts`

### 3.3 Request Validation & Error Handling

- [x] Add Zod validation middleware for request bodies
- [x] Add global error handler (return consistent JSON error responses)
- [x] Add 404 handler for unknown routes

### 3.4 API Tests

- [x] Create `src/api/routes/rules.routes.test.ts`:
  - Test create rule endpoint
  - Test list rules endpoint
  - Test get rule endpoint
  - Test update rule endpoint
  - Test cancel rule endpoint
- [x] Create `src/api/routes/positions.routes.test.ts`:
  - Test get positions endpoint
- [x] Set up test database:
  - Use separate Prisma client for tests
  - Use in-memory SQLite (`:memory:`) or separate test.db file
  - Run migrations before each test suite
  - Clean up database after each test

**Milestone**: HTTP API fully functional, agent can create and manage rules.

---

## Phase 4: Background Worker (Rule Monitoring)

### 4.1 Worker Core Loop

- [x] Create `src/worker/monitoringWorker.ts`:
  - `startWorker(intervalSeconds)` — start monitoring loop
  - `stopWorker()` — graceful shutdown
  - Main loop implementation:
    1. Fetch active rules
    2. Group rules by market/token (to batch API calls)
    3. Fetch current positions from Vincent
    4. Fetch current prices for relevant markets
    5. Update position cache
    6. Evaluate each rule
    7. Execute rules that trigger
    8. Log RULE_EVALUATED events
  - Use `setInterval` or async loop with delay

### 4.2 Rule Evaluation Logic

- [x] Implement `evaluateRule(rule, currentPrice)`:
  - STOP_LOSS: trigger if currentPrice <= triggerPrice
  - TAKE_PROFIT: trigger if currentPrice >= triggerPrice
  - Return boolean (should trigger)
- [x] Log evaluation results to rule_events table

### 4.3 Trade Execution

- [x] Integrate `ruleExecutor.service.ts` into worker loop
- [x] When rule triggers:
  - Execute trade via Vincent API
  - Mark rule as TRIGGERED atomically (use DB transaction)
  - Log ACTION_EXECUTED or ACTION_FAILED event
  - Include txHash/orderId in rule record

### 4.4 Error Handling & Resilience

- [x] Add circuit breaker for Vincent API failures:
  - Track consecutive failures
  - Pause polling after 5+ failures
  - Resume after cooldown period
- [x] Add exponential backoff for retries
- [x] Ensure worker doesn't crash on errors (catch all, log, continue)
- [x] Add worker health status (exposed via GET /status)

### 4.5 Worker Tests

- [x] Create `src/worker/monitoringWorker.test.ts`:
  - Mock Vincent API client
  - Test rule evaluation logic
  - Test that triggered rules execute trades
  - Test that rules are marked as triggered (idempotency)
  - Test error handling (API failures, etc.)

**Milestone**: Background worker automatically executes trades when rules trigger.

---

## Phase 5: CLI & Main Entry Point

### 5.1 Main Entry Point

- [x] Create `src/index.ts`:
  - Initialize config
  - Run Prisma migrations (or check connection)
  - Initialize Prisma client
  - Start HTTP server
  - Start background worker
  - Handle graceful shutdown (SIGTERM, SIGINT)
  - Disconnect Prisma client on shutdown
  - Log startup info (version, port, config path)

### 5.2 CLI Commands (Optional for MVP)

- [x] Create `src/cli.ts` (if needed for installation/management):
  - `trade-manager start` — start server + worker
  - `trade-manager version` — print version
  - `trade-manager config` — print current config
- [x] Or keep simple: just `node dist/index.js` to start

**Milestone**: App can be started and runs continuously.

---

## Phase 6: Deployment & Integration

### 6.1 Build & Package

- [x] Add build script: `npm run build` (compile TypeScript to dist/)
- [x] Test production build: `npm start`
- [x] Add `.gitignore` (node_modules, dist, \*.db, etc.)
- [x] Add `README.md` with:
  - Installation instructions
  - Configuration guide
  - API documentation
  - Development guide

### 6.2 Systemd Service Definition

- [x] Create `systemd/openclaw-trade-manager.service`:
  - Define ExecStart command
  - Set Restart=always
  - Set StandardOutput/StandardError to journal
- [x] Create install script (copies service file to `~/.config/systemd/user/`)
- [x] Test systemd service:
  - `systemctl --user enable openclaw-trade-manager`
  - `systemctl --user start openclaw-trade-manager`
  - `journalctl --user -u openclaw-trade-manager -f`

### 6.3 Agent Skill Documentation

- [x] Create `skills/trade-manager/SKILL.md` in Vincent repo:
  - Describe trade manager skill
  - Document API endpoints with examples
  - Add example agent prompts
  - Explain local API architecture (localhost:19000)
- [x] Add skill to Vincent docs/website

### 6.4 OpenClaw Provisioning Integration

- [x] Update OpenClaw provisioning script (in Vincent repo):
  - Install trade manager during VPS setup
  - Create config file with Vincent API key
  - Enable and start systemd service
  - Verify service is running
- [x] Test full provisioning flow on test VPS

**Milestone**: Trade manager auto-installs on new OpenClaw deployments.

---


## Implementation Notes (added during execution)

- Completed Phases 1-6 by implementing a standalone `trade-manager/` Node + Prisma + Express service with worker, API, config loader, and tests.
- Integrated OpenClaw provisioning (`buildSetupScript`) to install and start `openclaw-trade-manager` via systemd and write `~/.openclaw/trade-manager.json` automatically.
- Kept SELL_PARTIAL schema support, but MVP execution path is optimized for SELL_ALL market exits.
- Added circuit-breaker state to worker status and surfaced it through `GET /status` for operational visibility.
- Added deployment assets (`trade-manager/systemd/openclaw-trade-manager.service`, installer script, README, skill doc) to make VPS and local setup repeatable.

---

## Phase 7: Harness (Alerts + Wakeups)

### 7.1 Data Model

- [ ] Add `AlertEvent`, `HarnessJob`, and `ExecutionAttempt` models + migrations
- [ ] Add unique constraint for alert idempotency (`source`, `idempotencyKey`)
- [ ] Add DB helpers for leasing jobs and recording attempts
- [ ] Extend config schema for alert ingress + wake dispatch (shared secret, wake URL/token, job poll interval, max attempts)

### 7.2 Alert Ingress API

- [ ] Create `src/api/routes/alerts.routes.ts`:
  - `POST /api/alerts` (ingest with idempotency)
  - `GET /api/alerts` (list)
  - `GET /api/alerts/:id` (detail)
- [ ] Enforce auth via shared secret header (or token)
- [ ] Return existing alert on duplicate idempotency key
- [ ] Update `skills/trade-manager/SKILL.md` with alert/job endpoints and headers

### 7.3 Queue + Workers

- [ ] Create `src/services/harnessQueue.service.ts` for enqueue/dequeue with leasing
- [ ] Create `src/services/alertRouter.service.ts` to map alerts to EXECUTE_TXN or WAKE_AGENT
- [ ] Create `src/worker/harnessWorker.ts` to process jobs with retry/backoff and max attempts

### 7.4 Execution + Wake Integration

- [ ] Implement `src/services/executionRecorder.service.ts` and record request/response/txHash
- [ ] Implement `src/services/wakeDispatcher.service.ts` to call local OpenClaw gateway/CLI
- [ ] Add correlation IDs in wake payloads and logs

### 7.5 Status & Observability

- [ ] Expose job stats via `GET /status` or `GET /api/jobs`
- [ ] Add structured log fields for `alertId`, `jobId`, `correlationId`

### 7.6 Tests

- [ ] Unit tests for idempotency + routing
- [ ] Worker tests for retry/backoff and failure modes
- [ ] Integration test: ingest alert -> job -> execution/wake -> status update

**Milestone**: Alerts are durable and idempotent, and reliably result in a transaction or agent wake.

---

## Phase 8: End-to-End Testing

### 8.1 Integration Tests

- [ ] Create `tests/integration/` directory
- [ ] Test full flow:
  - Start trade manager locally
  - Create rule via API
  - Mock price change (or manually trigger)
  - Verify trade executes
  - Verify rule marked as triggered
  - Verify events logged
- [ ] Test with real Vincent API (testnet):
  - Create real Polymarket wallet
  - Place real bet (small amount)
  - Create stop-loss rule
  - Wait for price change or manually trigger
  - Verify position closes

### 8.2 Edge Case Testing

- [ ] Test rule for non-existent position
- [ ] Test multiple rules on same position
- [ ] Test rule triggering when Vincent API is down
- [ ] Test rule triggering when insufficient balance
- [ ] Test canceling rule before it triggers
- [ ] Test updating trigger price while rule is active
- [ ] Test worker restart (rules should resume monitoring)

### 8.3 Performance Testing

- [ ] Test with 10+ active rules
- [ ] Verify polling interval is respected
- [ ] Verify no memory leaks (run for extended period)
- [ ] Verify logs don't fill disk (add log rotation)

**Milestone**: App is stable and handles edge cases gracefully.

---

## Phase 9: Documentation & Launch

### 9.1 User Documentation

- [ ] Write user guide:
  - How to check if trade manager is running
  - How to view logs
  - How to create rules via agent
  - How to monitor rules
  - Troubleshooting common issues
- [ ] Add FAQ section
- [ ] Add examples for common scenarios (stop-loss, take-profit)

### 9.2 Developer Documentation

- [ ] Document code architecture
- [ ] Add inline code comments for complex logic
- [ ] Document environment variables and config options
- [ ] Add contributing guide (if open source)

### 9.3 Rollout

- [ ] Deploy to staging VPS for internal testing
- [ ] Test with real users (beta)
- [ ] Fix any issues discovered
- [ ] Roll out to all new OpenClaw deployments
- [ ] Announce feature to users

**Milestone**: Trade manager is live and documented.

---

## Phase 10: Post-MVP Enhancements (Future)

These are **not** part of the MVP and should be tackled after Phase 9:

### 10.1 Trailing Stops

- [ ] Add TRAILING_STOP rule type
- [ ] Implement logic to adjust trigger price as market moves
- [ ] Test trailing stop behavior

### 10.2 AI-Suggested Levels

- [ ] Add endpoint to suggest SL/TP levels
- [ ] Analyze market volatility and history
- [ ] Return suggested levels with reasoning

### 10.3 Paper Trading Mode

- [ ] Add paperTrading flag to rules
- [ ] Simulate trades without executing real orders
- [ ] Log simulated results

### 10.4 Advanced Triggers

- [ ] Time-based triggers
- [ ] Volume-based triggers
- [ ] News/sentiment triggers (integrate with data sources)

### 10.5 Notifications

- [ ] Add Telegram notifications when rules trigger
- [ ] Integrate with OpenClaw agent's Telegram bot

### 10.6 Web UI

- [ ] Build local web interface (optional)
- [ ] Deploy on same port as API
- [ ] Allow users to manage rules via browser

---

## Summary

**MVP Timeline** (Phases 1-9):

- Phase 1 (Project Setup): ~3 hours
- Phase 2 (Core Services): ~6 hours
- Phase 3 (HTTP API): ~4 hours
- Phase 4 (Background Worker): ~6 hours
- Phase 5 (CLI & Entry Point): ~2 hours
- Phase 6 (Deployment): ~4 hours
- Phase 7 (Harness): ~4 hours
- Phase 8 (Testing): ~4 hours
- Phase 9 (Documentation): ~3 hours

**Total MVP Effort**: ~36 hours of focused development

**Post-MVP** (Phase 10): Incremental features based on user feedback.
