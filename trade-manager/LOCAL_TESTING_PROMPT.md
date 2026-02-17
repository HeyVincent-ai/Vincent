# Local Testing Guide for Trade Manager

**You are an AI agent testing the OpenClaw Trade Manager service locally.**

## What is Trade Manager?

Trade Manager is a standalone service that runs on each OpenClaw VPS to manage automated trading rules (stop-loss, take-profit) for Polymarket positions. It monitors positions and automatically executes trades when trigger conditions are met.

**Key components:**
- **Local HTTP API** on `http://localhost:19000`
- **Background worker** that polls positions every 15 seconds
- **SQLite database** for rules, positions, and events
- **Vincent Polymarket API integration** for executing trades

## Your Testing Mission

Your goal is to:
1. Verify the Trade Manager service is running
2. Create various types of trading rules (stop-loss, take-profit)
3. Inspect rules and their status
4. Monitor the background worker's activity
5. Test rule updates and cancellations
6. Review event logs

## Prerequisites - Verify These First

Before testing, confirm:

```bash
# 1. Trade Manager is running
curl http://localhost:19000/health
# Expected: {"status":"ok","version":"0.1.0"}

# 2. Check worker status
curl http://localhost:19000/status
# Expected: JSON with worker info, active rules count, last sync time

# 3. Config file exists
cat ~/.openclaw/trade-manager.json
# Should show Vincent API URL and key
```

If any of these fail, the service isn't running. See `TESTING.md` for setup instructions.

## Skill Documentation Reference

Read `skills/trade-manager/SKILL.md` for the complete skill specification. This is what OpenClaw agents use to interact with Trade Manager.

Key points from the skill:
- Local API at `http://localhost:19000`
- Stores rules in local SQLite
- Executes trades through Vincent Polymarket API
- Supports STOP_LOSS and TAKE_PROFIT rule types

## Test Scenarios

### Scenario 1: Health Check & Status

**Goal:** Verify the service is healthy and operational.

```bash
# Basic health check
curl http://localhost:19000/health

# Detailed status (includes worker info)
curl http://localhost:19000/status
```

**What to check:**
- Health endpoint returns 200 OK
- Status shows worker is running
- Circuit breaker state should be "CLOSED" (healthy)
- Active rules count should be 0 initially

### Scenario 2: Create a Stop-Loss Rule

**Goal:** Create a rule that will sell a position if price drops below a threshold.

```bash
# Create stop-loss at $0.40
curl -X POST http://localhost:19000/api/rules \
  -H "Content-Type: application/json" \
  -d '{
    "marketId": "0x123456test",
    "tokenId": "789",
    "ruleType": "STOP_LOSS",
    "triggerPrice": 0.40,
    "action": {"type": "SELL_ALL"}
  }'
```

**Expected response:**
- Status 200
- Returns created rule with `id`, `status: "ACTIVE"`, timestamps
- `triggeredAt` should be null
- `triggerTxHash` should be null

**What to verify:**
- Rule is created successfully
- Rule ID is returned (save this for later tests)
- Status is "ACTIVE"
- Trigger price is correct

### Scenario 3: Create a Take-Profit Rule

**Goal:** Create a rule that will sell a position if price rises above a threshold.

```bash
# Create take-profit at $0.75
curl -X POST http://localhost:19000/api/rules \
  -H "Content-Type: application/json" \
  -d '{
    "marketId": "0x123456test",
    "tokenId": "789",
    "ruleType": "TAKE_PROFIT",
    "triggerPrice": 0.75,
    "action": {"type": "SELL_ALL"}
  }'
```

**Expected response:**
- Same as stop-loss, but with `ruleType: "TAKE_PROFIT"`

### Scenario 4: List All Rules

**Goal:** Retrieve all trading rules.

```bash
# Get all rules
curl http://localhost:19000/api/rules

# Get only active rules
curl 'http://localhost:19000/api/rules?status=ACTIVE'

# Get triggered rules
curl 'http://localhost:19000/api/rules?status=TRIGGERED'
```

**What to verify:**
- Returns array of rules
- Filter by status works correctly
- All previously created rules are present

### Scenario 5: Get a Specific Rule

**Goal:** Retrieve details for a single rule.

```bash
# Replace <rule-id> with actual ID from previous responses
curl http://localhost:19000/api/rules/<rule-id>
```

**What to verify:**
- Returns full rule details
- Includes all fields: id, ruleType, marketId, tokenId, triggerPrice, action, status, timestamps

### Scenario 6: Update a Rule's Trigger Price

**Goal:** Modify the trigger price of an active rule.

```bash
# Update trigger price
curl -X PATCH http://localhost:19000/api/rules/<rule-id> \
  -H "Content-Type: application/json" \
  -d '{
    "triggerPrice": 0.45
  }'
```

**What to verify:**
- Rule is updated successfully
- New trigger price is reflected
- `updatedAt` timestamp changes
- Other fields remain unchanged

### Scenario 7: Cancel a Rule

**Goal:** Deactivate a rule before it triggers.

```bash
# Cancel a rule
curl -X DELETE http://localhost:19000/api/rules/<rule-id>
```

**Expected response:**
- Rule status changes to "CANCELED"
- `updatedAt` timestamp changes
- Rule still exists (soft delete)

**What to verify:**
- GET /api/rules shows status as "CANCELED"
- Rule no longer appears in `?status=ACTIVE` filter

### Scenario 8: Monitor Positions

**Goal:** Check cached position data that the worker is monitoring.

```bash
curl http://localhost:19000/api/positions
```

**Expected response:**
- Array of monitored positions (may be empty initially)
- Each position includes: marketId, tokenId, quantity, currentPrice, lastUpdatedAt

**What to understand:**
- This is a cache updated by the background worker
- Worker fetches positions from Vincent API every 15 seconds
- Positions are only monitored if there are active rules for them

### Scenario 9: View Event Log

**Goal:** Inspect the audit trail of rule evaluations and actions.

```bash
# All events
curl http://localhost:19000/api/events

# Events for specific rule
curl 'http://localhost:19000/api/events?ruleId=<rule-id>'
```

**Expected event types:**
- `RULE_CREATED` - When rule is first created
- `RULE_EVALUATED` - When worker checks the rule (happens every poll)
- `RULE_TRIGGERED` - When trigger condition is met
- `ACTION_EXECUTED` - When trade executes successfully
- `ACTION_FAILED` - When trade execution fails
- `RULE_CANCELED` - When rule is manually canceled

**What to verify:**
- Events are logged chronologically
- Each event includes: id, ruleId, eventType, eventData (JSON), createdAt
- Filter by ruleId works correctly

### Scenario 10: Test with Multiple Rules

**Goal:** Create multiple rules on the same market and verify they're tracked independently.

```bash
# Create stop-loss
curl -X POST http://localhost:19000/api/rules \
  -H "Content-Type: application/json" \
  -d '{
    "marketId": "market-abc",
    "tokenId": "100",
    "ruleType": "STOP_LOSS",
    "triggerPrice": 0.35,
    "action": {"type": "SELL_ALL"}
  }'

# Create take-profit on same market
curl -X POST http://localhost:19000/api/rules \
  -H "Content-Type: application/json" \
  -d '{
    "marketId": "market-abc",
    "tokenId": "100",
    "ruleType": "TAKE_PROFIT",
    "triggerPrice": 0.80,
    "action": {"type": "SELL_ALL"}
  }'

# List all rules
curl http://localhost:19000/api/rules
```

**What to verify:**
- Both rules are created successfully
- Both track the same market but different conditions
- Worker status shows 2 active rules
- Each rule has unique ID

## Understanding the Background Worker

The worker runs continuously and:

1. **Every 15 seconds** (configurable):
   - Fetches active rules from database
   - Fetches current positions from Vincent API
   - Fetches current prices for relevant markets
   - Updates position cache
   - Evaluates each rule against current price
   - Executes trades if trigger conditions are met
   - Logs events

2. **Circuit Breaker**:
   - If Vincent API fails 5+ consecutive times, worker pauses
   - Enters "OPEN" state (visible in /status endpoint)
   - Resumes after cooldown period

3. **Idempotency**:
   - Once a rule triggers, it's marked TRIGGERED atomically
   - Same rule won't execute twice
   - Uses database transactions for safety

## Validation Rules

The API enforces these constraints:

- **triggerPrice**: Must be between 0 and 1 (Polymarket prices are probabilities)
- **action.type**: Must be "SELL_ALL" (SELL_PARTIAL is v2 feature)
- **ruleType**: Must be "STOP_LOSS" or "TAKE_PROFIT"
- **marketId, tokenId**: Required strings

Test invalid inputs to verify validation:

```bash
# Invalid trigger price (> 1)
curl -X POST http://localhost:19000/api/rules \
  -H "Content-Type: application/json" \
  -d '{
    "marketId": "test",
    "tokenId": "123",
    "ruleType": "STOP_LOSS",
    "triggerPrice": 1.5,
    "action": {"type": "SELL_ALL"}
  }'
# Expected: 400 Bad Request with validation error

# Missing required field
curl -X POST http://localhost:19000/api/rules \
  -H "Content-Type: application/json" \
  -d '{
    "marketId": "test",
    "ruleType": "STOP_LOSS",
    "triggerPrice": 0.5,
    "action": {"type": "SELL_ALL"}
  }'
# Expected: 400 Bad Request (missing tokenId)
```

## Testing with Real Polymarket Data (Optional)

If you have a real Vincent API key configured:

1. Find a real Polymarket market ID (from Vincent API or Polymarket.com)
2. Get your current positions: Check Vincent `/api/skills/polymarket/positions`
3. Create a rule for an actual position you hold
4. Set trigger price near current price to test triggering
5. Monitor worker logs to see actual execution

**Warning:** This will execute real trades! Only do this with small amounts or test markets.

## Expected Outputs & Success Criteria

After completing all scenarios, you should have:

✅ Verified service health and worker status
✅ Created multiple stop-loss rules
✅ Created multiple take-profit rules
✅ Listed and filtered rules by status
✅ Updated rule trigger prices
✅ Canceled rules
✅ Viewed monitored positions cache
✅ Inspected event logs for audit trail
✅ Tested validation with invalid inputs
✅ Confirmed worker is polling every 15 seconds (check timestamps in /status)

## Troubleshooting

### Service won't start
- Check config file: `cat ~/.openclaw/trade-manager.json`
- Check database file exists and is writable
- Check port 19000 isn't already in use: `lsof -i :19000`
- Check logs for errors

### Rules not triggering
- Verify worker is running: `curl http://localhost:19000/status`
- Check circuit breaker state (should be "CLOSED")
- Verify Vincent API key is valid
- Check if positions exist in Vincent API
- Monitor event log for RULE_EVALUATED events

### API returns errors
- Check request format (JSON, proper headers)
- Verify required fields are present
- Check trigger price is valid (0 < price < 1)
- Look at error message in response body

## Reporting Results

After testing, provide a summary including:

1. **What worked:**
   - Which scenarios passed
   - What features worked as expected

2. **What failed or behaved unexpectedly:**
   - Error messages
   - Unexpected responses
   - Missing features

3. **Worker behavior:**
   - Is it polling regularly?
   - Are events being logged?
   - Is the circuit breaker working?

4. **API observations:**
   - Response times
   - Data structure consistency
   - Validation behavior

## Next Steps After Testing

If everything works locally:
1. The package is ready for npm publishing
2. Can be deployed to real OpenClaw VPS
3. OpenClaw agents can use this skill to manage trades

See `PUBLISHING.md` for publishing instructions.
