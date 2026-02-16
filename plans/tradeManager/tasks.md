# Trade Manager Implementation Tasks

## Overview

This task list builds a **standalone Node.js app** that runs on each OpenClaw VPS. The app provides a local HTTP API for the OpenClaw agent to manage automated trading rules.

**MVP Goal**: Stop-loss and take-profit orders triggered by price movements, with user interacting via Telegram chat with their agent.

**Key Architecture**:

- Standalone Node.js app (separate from Vincent)
- Runs on each OpenClaw VPS (localhost API)
- SQLite for local state
- Calls Vincent Polymarket API to execute trades
- Agent interacts via local HTTP API

---

## Phase 1: Project Setup & Database

### 1.1 Initialize Project

- [ ] Create new directory: `trade-manager/`
- [ ] Initialize package.json: `npm init -y`
- [ ] Install core dependencies:
  - `express` (HTTP API)
  - `better-sqlite3` (SQLite database)
  - `zod` (validation)
  - `@cuid2/core` (ID generation)
  - `axios` (Vincent API client)
  - `pino` (logging)
- [ ] Install dev dependencies:
  - `typescript`, `@types/node`, `@types/express`, `@types/better-sqlite3`
  - `vitest` (testing)
  - `tsx` (dev server)
- [ ] Configure TypeScript (`tsconfig.json`):
  - `"type": "module"` in package.json
  - `"module": "NodeNext"`, `"moduleResolution": "NodeNext"`
  - `"strict": true`
- [ ] Add scripts to package.json:
  - `"dev": "tsx watch src/index.ts"`
  - `"build": "tsc"`
  - `"test": "vitest"`
  - `"start": "node dist/index.js"`

### 1.2 SQLite Database Setup

- [ ] Create `src/db/client.ts`:
  - Initialize better-sqlite3 connection
  - Export typed database instance
- [ ] Create `src/db/migrations.ts`:
  - Define schema (trade_rules, monitored_positions, rule_events, config tables)
  - Create migration runner that runs on startup
  - Add indexes as specified in plan
- [ ] Create `src/db/queries.ts`:
  - Type-safe query helpers for common operations
  - Rule CRUD operations
  - Position CRUD operations
  - Event logging

### 1.3 Configuration Management

- [ ] Create `src/config/config.ts`:
  - Load config from `~/.openclaw/trade-manager.json`
  - Fallback to env vars
  - Load Vincent API key from `~/.openclaw/credentials/agentwallet/`
  - Define config schema with Zod
  - Export typed config object
- [ ] Create default config template
- [ ] Add validation for required fields (vincentApiKey, vincentApiUrl)

**Milestone**: Database schema created, config loading works.

---

## Phase 2: Core Services (Business Logic)

### 2.1 Vincent API Client

- [ ] Create `src/services/vincentClient.service.ts`:
  - `getPositions()` — GET /api/skills/polymarket/positions
  - `getMarketPrice(marketId)` — GET /api/skills/polymarket/markets?marketId=...
  - `placeBet(input)` — POST /api/skills/polymarket/bet
  - `getBalance()` — GET /api/skills/polymarket/balance
  - Error handling with retry logic
  - Rate limiting to respect Vincent API limits

### 2.2 Rule Manager Service

- [ ] Create `src/services/ruleManager.service.ts`:
  - `createRule(input)` — validate and insert rule
  - `getRules(filters?)` — query rules with optional status filter
  - `getRule(id)` — get single rule
  - `updateRule(id, data)` — update trigger price
  - `cancelRule(id)` — mark as CANCELED
  - `markRuleTriggered(id, txHash)` — atomic update to TRIGGERED status
- [ ] Add Zod validation schemas for rule inputs
- [ ] Add business logic validation:
  - Ensure triggerPrice is valid (0 < price < 1)
  - Ensure action is valid (SELL_ALL or SELL_PARTIAL with amount)

### 2.3 Position Monitor Service

- [ ] Create `src/services/positionMonitor.service.ts`:
  - `updatePositions()` — fetch from Vincent API and upsert to DB
  - `getPosition(marketId, tokenId)` — query cached position
  - `getCurrentPrice(marketId, tokenId)` — fetch latest price from Vincent
  - `updatePositionPrice(marketId, tokenId, price)` — update cache

### 2.4 Event Logger Service

- [ ] Create `src/services/eventLogger.service.ts`:
  - `logEvent(ruleId, eventType, eventData)` — append-only log
  - `getEvents(ruleId?, limit?)` — query events
  - Define event type schemas

### 2.5 Rule Executor Service

- [ ] Create `src/services/ruleExecutor.service.ts`:
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

- [ ] Create `src/api/app.ts`:
  - Initialize Express app
  - Add JSON body parser
  - Add error handling middleware
  - Add request logging middleware
  - Export app instance

### 3.2 Route Handlers

- [ ] Create `src/api/routes/health.routes.ts`:
  - `GET /health` — returns `{ status: "ok", version: "..." }`
  - `GET /status` — returns worker status, active rules count, last sync time
- [ ] Create `src/api/routes/rules.routes.ts`:
  - `POST /api/rules` — create rule
  - `GET /api/rules` — list rules (with optional ?status= filter)
  - `GET /api/rules/:id` — get rule details
  - `PATCH /api/rules/:id` — update trigger price
  - `DELETE /api/rules/:id` — cancel rule
- [ ] Create `src/api/routes/positions.routes.ts`:
  - `GET /api/positions` — list monitored positions with current prices
- [ ] Create `src/api/routes/events.routes.ts`:
  - `GET /api/events` — get event log (with optional ?ruleId= filter)
- [ ] Wire up all routes in `src/api/app.ts`

### 3.3 Request Validation & Error Handling

- [ ] Add Zod validation middleware for request bodies
- [ ] Add global error handler (return consistent JSON error responses)
- [ ] Add 404 handler for unknown routes

### 3.4 API Tests

- [ ] Create `src/api/routes/rules.routes.test.ts`:
  - Test create rule endpoint
  - Test list rules endpoint
  - Test get rule endpoint
  - Test update rule endpoint
  - Test cancel rule endpoint
- [ ] Create `src/api/routes/positions.routes.test.ts`:
  - Test get positions endpoint
- [ ] Use in-memory SQLite for tests (`:memory:`)

**Milestone**: HTTP API fully functional, agent can create and manage rules.

---

## Phase 4: Background Worker (Rule Monitoring)

### 4.1 Worker Core Loop

- [ ] Create `src/worker/monitoringWorker.ts`:
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

- [ ] Implement `evaluateRule(rule, currentPrice)`:
  - STOP_LOSS: trigger if currentPrice <= triggerPrice
  - TAKE_PROFIT: trigger if currentPrice >= triggerPrice
  - Return boolean (should trigger)
- [ ] Log evaluation results to rule_events table

### 4.3 Trade Execution

- [ ] Integrate `ruleExecutor.service.ts` into worker loop
- [ ] When rule triggers:
  - Execute trade via Vincent API
  - Mark rule as TRIGGERED atomically (use DB transaction)
  - Log ACTION_EXECUTED or ACTION_FAILED event
  - Include txHash/orderId in rule record

### 4.4 Error Handling & Resilience

- [ ] Add circuit breaker for Vincent API failures:
  - Track consecutive failures
  - Pause polling after 5+ failures
  - Resume after cooldown period
- [ ] Add exponential backoff for retries
- [ ] Ensure worker doesn't crash on errors (catch all, log, continue)
- [ ] Add worker health status (exposed via GET /status)

### 4.5 Worker Tests

- [ ] Create `src/worker/monitoringWorker.test.ts`:
  - Mock Vincent API client
  - Test rule evaluation logic
  - Test that triggered rules execute trades
  - Test that rules are marked as triggered (idempotency)
  - Test error handling (API failures, etc.)

**Milestone**: Background worker automatically executes trades when rules trigger.

---

## Phase 5: CLI & Main Entry Point

### 5.1 Main Entry Point

- [ ] Create `src/index.ts`:
  - Initialize config
  - Run database migrations
  - Start HTTP server
  - Start background worker
  - Handle graceful shutdown (SIGTERM, SIGINT)
  - Log startup info (version, port, config path)

### 5.2 CLI Commands (Optional for MVP)

- [ ] Create `src/cli.ts` (if needed for installation/management):
  - `trade-manager start` — start server + worker
  - `trade-manager version` — print version
  - `trade-manager config` — print current config
- [ ] Or keep simple: just `node dist/index.js` to start

**Milestone**: App can be started and runs continuously.

---

## Phase 6: Deployment & Integration

### 6.1 Build & Package

- [ ] Add build script: `npm run build` (compile TypeScript to dist/)
- [ ] Test production build: `npm start`
- [ ] Add `.gitignore` (node_modules, dist, \*.db, etc.)
- [ ] Add `README.md` with:
  - Installation instructions
  - Configuration guide
  - API documentation
  - Development guide

### 6.2 Systemd Service Definition

- [ ] Create `systemd/openclaw-trade-manager.service`:
  - Define ExecStart command
  - Set Restart=always
  - Set StandardOutput/StandardError to journal
- [ ] Create install script (copies service file to `~/.config/systemd/user/`)
- [ ] Test systemd service:
  - `systemctl --user enable openclaw-trade-manager`
  - `systemctl --user start openclaw-trade-manager`
  - `journalctl --user -u openclaw-trade-manager -f`

### 6.3 Agent Skill Documentation

- [ ] Create `skills/trade-manager/SKILL.md` in Vincent repo:
  - Describe trade manager skill
  - Document API endpoints with examples
  - Add example agent prompts
  - Explain local API architecture (localhost:19000)
- [ ] Add skill to Vincent docs/website

### 6.4 OpenClaw Provisioning Integration

- [ ] Update OpenClaw provisioning script (in Vincent repo):
  - Install trade manager during VPS setup
  - Create config file with Vincent API key
  - Enable and start systemd service
  - Verify service is running
- [ ] Test full provisioning flow on test VPS

**Milestone**: Trade manager auto-installs on new OpenClaw deployments.

---

## Phase 7: End-to-End Testing

### 7.1 Integration Tests

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

### 7.2 Edge Case Testing

- [ ] Test rule for non-existent position
- [ ] Test multiple rules on same position
- [ ] Test rule triggering when Vincent API is down
- [ ] Test rule triggering when insufficient balance
- [ ] Test canceling rule before it triggers
- [ ] Test updating trigger price while rule is active
- [ ] Test worker restart (rules should resume monitoring)

### 7.3 Performance Testing

- [ ] Test with 10+ active rules
- [ ] Verify polling interval is respected
- [ ] Verify no memory leaks (run for extended period)
- [ ] Verify logs don't fill disk (add log rotation)

**Milestone**: App is stable and handles edge cases gracefully.

---

## Phase 8: Documentation & Launch

### 8.1 User Documentation

- [ ] Write user guide:
  - How to check if trade manager is running
  - How to view logs
  - How to create rules via agent
  - How to monitor rules
  - Troubleshooting common issues
- [ ] Add FAQ section
- [ ] Add examples for common scenarios (stop-loss, take-profit)

### 8.2 Developer Documentation

- [ ] Document code architecture
- [ ] Add inline code comments for complex logic
- [ ] Document environment variables and config options
- [ ] Add contributing guide (if open source)

### 8.3 Rollout

- [ ] Deploy to staging VPS for internal testing
- [ ] Test with real users (beta)
- [ ] Fix any issues discovered
- [ ] Roll out to all new OpenClaw deployments
- [ ] Announce feature to users

**Milestone**: Trade manager is live and documented.

---

## Phase 9: Post-MVP Enhancements (Future)

These are **not** part of the MVP and should be tackled after Phase 8:

### 9.1 Trailing Stops

- [ ] Add TRAILING_STOP rule type
- [ ] Implement logic to adjust trigger price as market moves
- [ ] Test trailing stop behavior

### 9.2 AI-Suggested Levels

- [ ] Add endpoint to suggest SL/TP levels
- [ ] Analyze market volatility and history
- [ ] Return suggested levels with reasoning

### 9.3 Paper Trading Mode

- [ ] Add paperTrading flag to rules
- [ ] Simulate trades without executing real orders
- [ ] Log simulated results

### 9.4 Advanced Triggers

- [ ] Time-based triggers
- [ ] Volume-based triggers
- [ ] News/sentiment triggers (integrate with data sources)

### 9.5 Notifications

- [ ] Add Telegram notifications when rules trigger
- [ ] Integrate with OpenClaw agent's Telegram bot

### 9.6 Web UI

- [ ] Build local web interface (optional)
- [ ] Deploy on same port as API
- [ ] Allow users to manage rules via browser

---

## Summary

**MVP Timeline** (Phases 1-8):

- Phase 1 (Project Setup): ~3 hours
- Phase 2 (Core Services): ~6 hours
- Phase 3 (HTTP API): ~4 hours
- Phase 4 (Background Worker): ~6 hours
- Phase 5 (CLI & Entry Point): ~2 hours
- Phase 6 (Deployment): ~4 hours
- Phase 7 (Testing): ~4 hours
- Phase 8 (Documentation): ~3 hours

**Total MVP Effort**: ~32 hours of focused development

**Post-MVP** (Phase 9): Incremental features based on user feedback.
