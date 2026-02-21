# Trade Manager - Automated Stop-Loss, Take-Profit, and Trailing Stops

Use this skill to create automated trading rules (stop-loss, take-profit, trailing stop) for your Polymarket positions. The Trade Manager runs locally on your OpenClaw VPS and automatically executes trades when price conditions are met.

All commands use the `@vincentai/cli` package. The CLI communicates with the local Trade Manager daemon at `http://localhost:19000`.

## How It Works

**Trade Manager is a companion to the Polymarket skill:**
1. Use the **Polymarket skill** to browse markets and place bets
2. Use **Trade Manager** to set automated exit rules on those positions
3. The Trade Manager monitors prices **in real-time via WebSocket** (with 15-second polling as fallback) and executes trades through Vincent's Polymarket API when triggers are met

**Architecture:**
- Local daemon running on your OpenClaw VPS
- Local HTTP API at `http://localhost:19000`
- Stores rules and events in local SQLite database
- Executes trades through Vincent Polymarket API (same as manual trading)
- All Vincent policies (spending limits, approvals) still apply

## Quick Start

### 1. Check Trade Manager Status

Before creating rules, verify the service is running:

```bash
npx @vincentai/cli@latest trade-manager health
# Expected: {"status":"ok","version":"0.1.0"}

npx @vincentai/cli@latest trade-manager status --key-id <KEY_ID>
# Returns: worker status, active rules count, last sync time, circuit breaker state
```

### 2. Create a Stop-Loss Rule

Automatically sell a position if price drops below a threshold:

```bash
npx @vincentai/cli@latest trade-manager create-rule --key-id <KEY_ID> \
  --market-id 0x123... --token-id 456789 \
  --rule-type STOP_LOSS --trigger-price 0.40
```

**Parameters:**
- `--market-id`: The Polymarket condition ID (from market data)
- `--token-id`: The outcome token ID you hold (from market data — use the token ID you bought)
- `--rule-type`: `STOP_LOSS` (sells if price <= trigger), `TAKE_PROFIT` (sells if price >= trigger), or `TRAILING_STOP`
- `--trigger-price`: Price threshold between 0 and 1 (e.g., 0.40 = 40 cents)

The CLI automatically passes `{"type": "SELL_ALL"}` as the action (only supported type in MVP).

### 3. Create a Take-Profit Rule

Automatically sell a position if price rises above a threshold:

```bash
npx @vincentai/cli@latest trade-manager create-rule --key-id <KEY_ID> \
  --market-id 0x123... --token-id 456789 \
  --rule-type TAKE_PROFIT --trigger-price 0.75
```

**Pro tip:** Create both a stop-loss AND take-profit on the same position to bracket your trade.

### 4. Create a Trailing Stop Rule

A trailing stop starts with a stop price, then automatically moves that stop price up as price rises.

```bash
npx @vincentai/cli@latest trade-manager create-rule --key-id <KEY_ID> \
  --market-id 0x123... --token-id 456789 \
  --rule-type TRAILING_STOP --trigger-price 0.45 --trailing-percent 5
```

**Trailing stop behavior:**
- `--trailing-percent` is percent points (for example `5` means 5%)
- Trade Manager computes `candidateStop = currentPrice * (1 - trailingPercent/100)`
- If `candidateStop` is above the current `triggerPrice`, it updates `triggerPrice`
- `triggerPrice` never moves down
- Rule triggers when `currentPrice <= triggerPrice`

### 5. List Active Rules

```bash
# All rules
npx @vincentai/cli@latest trade-manager list-rules --key-id <KEY_ID>

# Only active rules
npx @vincentai/cli@latest trade-manager list-rules --key-id <KEY_ID> --status ACTIVE

# Only triggered rules
npx @vincentai/cli@latest trade-manager list-rules --key-id <KEY_ID> --status TRIGGERED
```

### 6. Update a Rule's Trigger Price

```bash
npx @vincentai/cli@latest trade-manager update-rule --key-id <KEY_ID> --rule-id <RULE_ID> --trigger-price 0.45
```

### 7. Cancel a Rule

```bash
npx @vincentai/cli@latest trade-manager delete-rule --key-id <KEY_ID> --rule-id <RULE_ID>
```

The rule status changes to "CANCELED" and won't trigger anymore.

### 8. View Monitored Positions

See what positions the Trade Manager is currently tracking:

```bash
npx @vincentai/cli@latest trade-manager positions --key-id <KEY_ID>
```

Returns cached position data with current prices. This cache updates in real-time via WebSocket (with 15-second polling fallback).

### 9. View Event Log (Audit Trail)

See detailed history of rule evaluations and executions:

```bash
# All events (most recent first, default limit=100)
npx @vincentai/cli@latest trade-manager events --key-id <KEY_ID>

# Events for specific rule
npx @vincentai/cli@latest trade-manager events --key-id <KEY_ID> --rule-id <RULE_ID>

# Paginated results
npx @vincentai/cli@latest trade-manager events --key-id <KEY_ID> --rule-id <RULE_ID> --limit 50 --offset 100
```

**Event types:**
- `RULE_CREATED` - Rule was created
- `RULE_TRAILING_UPDATED` - Trailing stop moved triggerPrice upward
- `RULE_EVALUATED` - Worker checked the rule against current price
- `RULE_TRIGGERED` - Trigger condition was met
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
npx @vincentai/cli@latest polymarket markets --key-id <KEY_ID> --query bitcoin

# Place a bet on "Yes" outcome
npx @vincentai/cli@latest polymarket bet --key-id <KEY_ID> --token-id 123456789 --side BUY --amount 10 --price 0.55
# You bought 18.18 shares at 55 cents
```

### Step 2: Set stop-loss with Trade Manager

```bash
# Protect your position with a 40 cent stop-loss
npx @vincentai/cli@latest trade-manager create-rule --key-id <KEY_ID> \
  --market-id 0xabc... --token-id 123456789 \
  --rule-type STOP_LOSS --trigger-price 0.40
```

### Step 3: Set take-profit with Trade Manager

```bash
# Lock in profit if price hits 85 cents
npx @vincentai/cli@latest trade-manager create-rule --key-id <KEY_ID> \
  --market-id 0xabc... --token-id 123456789 \
  --rule-type TAKE_PROFIT --trigger-price 0.85
```

### Step 4: Monitor your rules

```bash
# Check status
npx @vincentai/cli@latest trade-manager list-rules --key-id <KEY_ID> --status ACTIVE

# Check recent events
npx @vincentai/cli@latest trade-manager events --key-id <KEY_ID>
```

### What Happens When a Rule Triggers

1. **Worker detects trigger:** The background worker checks all active rules against current prices in real-time via WebSocket (with 15-second polling as fallback)
2. **Rule marked as triggered:** Status changes from `ACTIVE` to `TRIGGERED` atomically (prevents double-execution)
3. **Trade executes:** Calls Vincent Polymarket API to place a market sell order
4. **Events logged:** Creates `RULE_TRIGGERED` and `ACTION_EXECUTED` events
5. **You're notified:** (Future feature — Telegram notifications coming soon)

**Important:** Executed trades still go through Vincent's policy enforcement. If your trade violates a spending limit or requires approval, the Trade Manager respects those policies.

## Rule Statuses

- `ACTIVE` - Rule is live and being monitored
- `TRIGGERED` - Condition was met, trade executed (or attempted)
- `CANCELED` - Rule was manually canceled before triggering
- `FAILED` - Rule triggered but trade execution failed
- `EXPIRED` - (Future feature for time-based expiration)

## Background Worker

The Trade Manager runs a background worker that:
- Monitors prices in real-time via Polymarket WebSocket feed
- Falls back to HTTP polling every 15 seconds if WebSocket is unavailable
- Fetches current positions from Vincent Polymarket API
- Evaluates each rule against current price on every update
- Executes trades when conditions are met
- Logs all evaluations and actions

**Circuit Breaker:**
If Vincent API fails 5+ consecutive times, the worker enters "OPEN" state and pauses polling. It resumes after a cooldown period. Check worker status:

```bash
npx @vincentai/cli@latest trade-manager status --key-id <KEY_ID>
```

Look for `circuitBreakerState: "CLOSED"` (healthy) or `"OPEN"` (paused due to errors).

## Error Handling

### Common Errors

**400 Bad Request - Invalid trigger price:**
Fix: Use prices between 0.01 and 0.99

**400 Bad Request - Missing required field:**
Fix: Include all required flags (--market-id, --token-id, --rule-type, --trigger-price)

**404 Not Found - Rule doesn't exist:**
Fix: Check the rule ID is correct

**500 Internal Server Error - Trade execution failed:**
The rule status will be `FAILED` with an `errorMessage` field explaining what went wrong. Common causes:
- Insufficient balance
- Market closed
- Vincent API unreachable
- Policy violation

Check the event log for details:
```bash
npx @vincentai/cli@latest trade-manager events --key-id <KEY_ID> --rule-id <RULE_ID>
```

## Best Practices

1. **Always set both stop-loss and take-profit** to bracket your position
2. **Don't set triggers too close** to current price — market noise can trigger prematurely
3. **Monitor the worker status** — if circuit breaker is OPEN, your rules won't trigger
4. **Check event logs** after rules trigger to verify execution
5. **Cancel old rules** after positions close to keep your rule list clean
6. **Use SELL_ALL** — partial sells (`SELL_PARTIAL`) coming in v2

## Limitations (MVP)

- Only supports `SELL_ALL` action (no partial sells yet)
- No time-based triggers (coming in v2)
- No Telegram notifications yet (manual event log checking)

## Example User Prompts

When a user says:
- **"Set a stop-loss at 40 cents for my Bitcoin Yes position"** -> Create STOP_LOSS rule
- **"Take profit at 85 cents"** -> Create TAKE_PROFIT rule
- **"Set a 5% trailing stop on my Bitcoin Yes position"** -> Create TRAILING_STOP rule
- **"What are my active stop-losses?"** -> List rules with `--status ACTIVE`
- **"Cancel my stop-loss for market XYZ"** -> Delete the rule
- **"Did my stop-loss trigger?"** -> Check rule status and event log
- **"Move my stop-loss to 50 cents"** -> Update the rule's trigger price

## Important Notes

- **Authorization:** All endpoints (except health) require the same Polymarket API key you use for the Polymarket skill
- **Local only:** The API listens on `localhost:19000` — only accessible from the same VPS
- **No private keys:** Trade Manager uses Vincent API for all trades — your private key stays secure on Vincent's servers
- **Policy enforcement:** All trades executed by Trade Manager still go through Vincent's policy checks
- **Idempotency:** Rules only trigger once — even if the worker crashes and restarts
- **Database location:** SQLite DB at `${OPENCLAW_STATE_DIR:-$HOME/.openclaw}/trade-manager.db` (or configured path)
