# Trade Manager - Automated Stop-Loss, Take-Profit, and Trailing Stops

Use this skill to create automated trading rules (stop-loss, take-profit, trailing stop) for your Polymarket positions. The Trade Manager runs as part of the Vincent backend and automatically executes trades when price conditions are met.

## How It Works

**Trade Manager is a companion to the Polymarket skill:**
1. Use the **Polymarket skill** to browse markets and place bets
2. Use **Trade Manager** to set automated exit rules on those positions
3. The Trade Manager monitors prices **in real-time via WebSocket** (with polling as fallback) and executes trades through the same Polymarket infrastructure when triggers are met

**Architecture:**
- Integrated into the Vincent backend (no separate service to run)
- API endpoints under `/api/skills/polymarket/rules/...`
- Uses the same API key as the Polymarket skill
- Stores rules and events in the Vincent database
- Executes trades through the same policy-enforced Polymarket pipeline
- All Vincent policies (spending limits, approvals) still apply

## Quick Start

### 1. Check Worker Status

Before creating rules, verify the monitoring worker is running:

```bash
curl "https://heyvincent.ai/api/skills/polymarket/rules/status" \
  -H "Authorization: Bearer <API_KEY>"
# Returns: running state, active rules count, last sync time, circuit breaker state, WebSocket status
```

### 2. Create a Stop-Loss Rule

Automatically sell a position if price drops below a threshold:

```bash
curl -X POST "https://heyvincent.ai/api/skills/polymarket/rules" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <API_KEY>" \
  -d '{
    "marketId": "0x123...",
    "tokenId": "456789",
    "ruleType": "STOP_LOSS",
    "triggerPrice": 0.40,
    "action": {"type": "SELL_ALL"}
  }'
```

**Parameters:**
- `marketId`: The Polymarket condition ID (from market data)
- `tokenId`: The outcome token ID you hold (from market data - use the token ID you bought)
- `ruleType`: `"STOP_LOSS"` (sells if price <= trigger) or `"TAKE_PROFIT"` (sells if price >= trigger)
- `triggerPrice`: Price threshold between 0 and 1 (e.g., 0.40 = 40 cents)
- `action`: `{"type": "SELL_ALL"}` or `{"type": "SELL_PARTIAL", "amount": N}`

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "clxyz123...",
    "ruleType": "STOP_LOSS",
    "marketId": "0x123...",
    "tokenId": "456789",
    "triggerPrice": 0.40,
    "action": "{\"type\":\"SELL_ALL\"}",
    "status": "ACTIVE",
    "triggeredAt": null,
    "triggerTxHash": null,
    "createdAt": "2026-02-20T12:00:00.000Z",
    "updatedAt": "2026-02-20T12:00:00.000Z"
  }
}
```

### 3. Create a Take-Profit Rule

Automatically sell a position if price rises above a threshold:

```bash
curl -X POST "https://heyvincent.ai/api/skills/polymarket/rules" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <API_KEY>" \
  -d '{
    "marketId": "0x123...",
    "tokenId": "456789",
    "ruleType": "TAKE_PROFIT",
    "triggerPrice": 0.75,
    "action": {"type": "SELL_ALL"}
  }'
```

**Pro tip:** Create both a stop-loss AND take-profit on the same position to bracket your trade.

### 4. Create a Trailing Stop Rule

A trailing stop starts with a stop price, then automatically moves that stop price up as price rises.

```bash
curl -X POST "https://heyvincent.ai/api/skills/polymarket/rules" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <API_KEY>" \
  -d '{
    "marketId": "0x123...",
    "tokenId": "456789",
    "ruleType": "TRAILING_STOP",
    "triggerPrice": 0.45,
    "trailingPercent": 5,
    "action": {"type": "SELL_ALL"}
  }'
```

**Trailing stop behavior:**
- `trailingPercent` is percent points (for example `5` means 5%)
- Trade Manager computes `candidateStop = currentPrice * (1 - trailingPercent/100)`
- If `candidateStop` is above the current `triggerPrice`, it updates `triggerPrice`
- `triggerPrice` never moves down
- Rule triggers when `currentPrice <= triggerPrice`

### 5. List Active Rules

```bash
# All rules
curl "https://heyvincent.ai/api/skills/polymarket/rules" \
  -H "Authorization: Bearer <API_KEY>"

# Only active rules
curl "https://heyvincent.ai/api/skills/polymarket/rules?status=ACTIVE" \
  -H "Authorization: Bearer <API_KEY>"

# Only triggered rules
curl "https://heyvincent.ai/api/skills/polymarket/rules?status=TRIGGERED" \
  -H "Authorization: Bearer <API_KEY>"
```

### 6. Update a Rule's Trigger Price

```bash
curl -X PATCH "https://heyvincent.ai/api/skills/polymarket/rules/<rule-id>" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <API_KEY>" \
  -d '{
    "triggerPrice": 0.45
  }'
```

### 7. Cancel a Rule

```bash
curl -X DELETE "https://heyvincent.ai/api/skills/polymarket/rules/<rule-id>" \
  -H "Authorization: Bearer <API_KEY>"
```

The rule status changes to "CANCELED" and won't trigger anymore.

### 8. View Monitored Positions

See what positions the Trade Manager is currently tracking:

```bash
curl "https://heyvincent.ai/api/skills/polymarket/rules/positions" \
  -H "Authorization: Bearer <API_KEY>"
```

Returns cached position data with current prices. This cache updates via WebSocket and periodic polling.

### 9. View Event Log (Audit Trail)

See detailed history of rule evaluations and executions:

```bash
# All events (most recent first, default limit=100)
curl "https://heyvincent.ai/api/skills/polymarket/rules/events" \
  -H "Authorization: Bearer <API_KEY>"

# Events for specific rule
curl "https://heyvincent.ai/api/skills/polymarket/rules/events?ruleId=<rule-id>" \
  -H "Authorization: Bearer <API_KEY>"

# Paginated results (limit 1-500, offset for paging)
curl "https://heyvincent.ai/api/skills/polymarket/rules/events?ruleId=<rule-id>&limit=50&offset=100" \
  -H "Authorization: Bearer <API_KEY>"
```

**Event types:**
- `RULE_CREATED` - Rule was created
- `RULE_TRAILING_UPDATED` - Trailing stop moved triggerPrice upward
- `RULE_EVALUATED` - Worker checked the rule against current price
- `RULE_TRIGGERED` - Trigger condition was met
- `ACTION_PENDING_APPROVAL` - Trade requires human approval, rule paused
- `ACTION_EXECUTED` - Trade executed successfully
- `ACTION_FAILED` - Trade execution failed
- `RULE_CANCELED` - Rule was manually canceled

Each event includes a `data` object with fields relevant to the event type:
- `currentPrice` - Price at time of evaluation
- `triggerPrice` - The rule's trigger threshold
- `shouldTrigger` - Whether the condition was met
- `source` - `"websocket"` for real-time WebSocket updates, absent for polling-based evaluations

## Complete Workflow: Polymarket + Trade Manager

Here's how to use both skills together:

### Step 1: Place a bet with Polymarket skill

```bash
# Search for a market
curl "https://heyvincent.ai/api/skills/polymarket/markets?query=bitcoin" \
  -H "Authorization: Bearer <API_KEY>"

# Place a bet on "Yes" outcome
curl -X POST "https://heyvincent.ai/api/skills/polymarket/bet" \
  -H "Authorization: Bearer <API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "tokenId": "123456789",
    "side": "BUY",
    "amount": 10
  }'
```

### Step 2: Set stop-loss with Trade Manager

```bash
# Protect your position with a 40 cent stop-loss
curl -X POST "https://heyvincent.ai/api/skills/polymarket/rules" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <API_KEY>" \
  -d '{
    "marketId": "0xabc...",
    "tokenId": "123456789",
    "ruleType": "STOP_LOSS",
    "triggerPrice": 0.40,
    "action": {"type": "SELL_ALL"}
  }'
```

### Step 3: Set take-profit with Trade Manager

```bash
# Lock in profit if price hits 85 cents
curl -X POST "https://heyvincent.ai/api/skills/polymarket/rules" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <API_KEY>" \
  -d '{
    "marketId": "0xabc...",
    "tokenId": "123456789",
    "ruleType": "TAKE_PROFIT",
    "triggerPrice": 0.85,
    "action": {"type": "SELL_ALL"}
  }'
```

### Step 4: Monitor your rules

```bash
# Check active rules
curl "https://heyvincent.ai/api/skills/polymarket/rules?status=ACTIVE" \
  -H "Authorization: Bearer <API_KEY>"

# Check recent events
curl "https://heyvincent.ai/api/skills/polymarket/rules/events" \
  -H "Authorization: Bearer <API_KEY>"

# Check worker status
curl "https://heyvincent.ai/api/skills/polymarket/rules/status" \
  -H "Authorization: Bearer <API_KEY>"
```

### What Happens When a Rule Triggers

1. **Worker detects trigger:** The background worker checks all active rules against current prices in real-time via WebSocket (with periodic polling as fallback)
2. **Rule marked as triggered:** Status changes from `ACTIVE` to `TRIGGERED` atomically (prevents double-execution)
3. **Trade executes:** Calls the Polymarket bet pipeline to place a market sell order (same pipeline as manual trading, with full policy enforcement)
4. **Events logged:** Creates `RULE_TRIGGERED` and `ACTION_EXECUTED` events
5. **Rule scoped to your agent:** Each agent only sees and manages their own rules

**Important:** Executed trades still go through Vincent's policy enforcement. If your trade violates a spending limit or requires approval, the Trade Manager respects those policies.

## Rule Statuses

- `ACTIVE` - Rule is live and being monitored
- `TRIGGERED` - Condition was met, trade executed (or attempted)
- `PENDING_APPROVAL` - Trade requires human approval; rule is paused until the approval is granted or denied
- `CANCELED` - Rule was manually canceled before triggering
- `FAILED` - Rule triggered but trade execution failed
- `EXPIRED` - (Future feature for time-based expiration)

## Background Worker

The Trade Manager runs a background worker that:
- Monitors prices in real-time via Polymarket WebSocket feed
- Falls back to HTTP polling on a configurable interval if WebSocket is unavailable
- Fetches current positions from the Polymarket API for each agent with active rules
- Evaluates each rule against current price on every update
- Executes trades when conditions are met
- Logs trigger events, trailing stop adjustments, and execution outcomes

**Circuit Breaker:**
If the Polymarket API fails 5+ consecutive times, the worker pauses. It resumes after a cooldown period. Check worker status:

```bash
curl "https://heyvincent.ai/api/skills/polymarket/rules/status" \
  -H "Authorization: Bearer <API_KEY>"
```

Look for `consecutiveFailures: 0` (healthy) or a `circuitBreakerUntil` timestamp (paused due to errors).

## Error Handling

### Common Errors

**400 Bad Request - Invalid trigger price:**
```json
{"error": "Trigger price must be between 0 and 1"}
```
Fix: Use prices between 0.01 and 0.99

**400 Bad Request - Missing required field:**
```json
{"error": "tokenId is required"}
```
Fix: Include all required fields (marketId, tokenId, ruleType, triggerPrice, action)

**404 Not Found - Rule doesn't exist:**
```json
{"error": "Rule not found"}
```
Fix: Check the rule ID is correct and belongs to your agent

**Failed rule execution:**
The rule status will be `FAILED` with an `errorMessage` field explaining what went wrong. Common causes:
- Insufficient balance
- Market closed or resolved
- Policy violation (spending limit, approval required)

Check the event log for details:
```bash
curl "https://heyvincent.ai/api/skills/polymarket/rules/events?ruleId=<rule-id>" \
  -H "Authorization: Bearer <API_KEY>"
```

## Best Practices

1. **Always set both stop-loss and take-profit** to bracket your position
2. **Don't set triggers too close** to current price - market noise can trigger prematurely
3. **Monitor the worker status** - if circuit breaker is active, your rules won't trigger
4. **Check event logs** after rules trigger to verify execution
5. **Cancel old rules** after positions close to keep your rule list clean

## Example User Prompts

When a user says:
- **"Set a stop-loss at 40 cents for my Bitcoin Yes position"** -> Create STOP_LOSS rule
- **"Take profit at 85 cents"** -> Create TAKE_PROFIT rule
- **"Set a 5% trailing stop on my Bitcoin Yes position"** -> Create TRAILING_STOP rule
- **"What are my active stop-losses?"** -> List rules with `status=ACTIVE`
- **"Cancel my stop-loss for market XYZ"** -> Delete the rule
- **"Did my stop-loss trigger?"** -> Check rule status and event log
- **"Move my stop-loss to 50 cents"** -> PATCH the rule's triggerPrice

## API Reference

All endpoints are under `/api/skills/polymarket/rules` and require the same API key used for the Polymarket skill.

### POST /api/skills/polymarket/rules
Create a new trading rule.

**Request:**
```json
{
  "marketId": "string",
  "tokenId": "string",
  "ruleType": "STOP_LOSS" | "TAKE_PROFIT" | "TRAILING_STOP",
  "triggerPrice": number,
  "trailingPercent": number,
  "action": {"type": "SELL_ALL"} | {"type": "SELL_PARTIAL", "amount": number}
}
```

**Response:** Rule object with `id`, `status: "ACTIVE"`, timestamps

### GET /api/skills/polymarket/rules
List all rules for your agent. Optional query param: `?status=ACTIVE|TRIGGERED|PENDING_APPROVAL|CANCELED|FAILED`

### GET /api/skills/polymarket/rules/:id
Get a specific rule by ID.

### PATCH /api/skills/polymarket/rules/:id
Update a rule's trigger price.

**Request:**
```json
{
  "triggerPrice": number
}
```

### DELETE /api/skills/polymarket/rules/:id
Cancel a rule. Changes status to "CANCELED".

### GET /api/skills/polymarket/rules/positions
Get monitored positions for your agent (cached, updated periodically).

### GET /api/skills/polymarket/rules/events
Get event log. Query params: `?ruleId=<id>&limit=100&offset=0` (limit: 1-500, default 100)

### GET /api/skills/polymarket/rules/status
Worker status including running state, active rules count, last sync time, circuit breaker state, WebSocket connection status.

## Important Notes

- **Authorization:** Uses the same Polymarket API key as the Polymarket skill
- **Multi-tenant:** Each agent only sees their own rules and positions
- **No private keys:** Trade Manager uses the same server-side Polymarket pipeline - your private key stays secure
- **Policy enforcement:** All trades executed by Trade Manager go through Vincent's policy checks
- **Idempotency:** Rules only trigger once - even if the worker restarts
