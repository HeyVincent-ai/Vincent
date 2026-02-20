# Local Testing Guide for AI Agent

**You are an AI agent testing the Trade Manager skill locally against the Vincent backend.**

## Your Mission

Test the Trade Manager skill by actually using it alongside the Polymarket skill. Read the skill documentation files, understand how they work together, and use them to place bets and set automated stop-loss/take-profit rules.

## Setup Verification

Before you start, verify your environment is ready:

```bash
# 1. Check Vincent backend is running
curl http://localhost:3000/health

# 2. Verify you have access to the Polymarket API
# (Your API key should be in ~/.openclaw/credentials/agentwallet/ or provided by the user)
```

If the health check fails, ask the user for help starting the backend.

## Skill Documentation

Read these skill files to understand how to use both services. **We are testing locally** — use `http://localhost:3000` instead of `https://heyvincent.ai` for all API calls.

### 1. Polymarket Skill

**Location:** `/Users/chris/Documents/WorkStuff/Lit/skills/SafeSkills-2/skills/polymarket/SKILL.md`

This skill explains how to:

- Create a Polymarket wallet
- Browse and search markets
- Place bets (BUY/SELL)
- View positions and balances
- Manage orders

**Important:** Replace `https://heyvincent.ai` with `http://localhost:3000` in all API calls.

### 2. Trade Manager Skill

**Location:** `/Users/chris/Documents/WorkStuff/Lit/skills/SafeSkills-2/skills/trade-manager/SKILL.md`

This skill explains how to:

- Create stop-loss rules (sell if price drops)
- Create take-profit rules (sell if price rises)
- Create trailing stop rules
- List, update, and cancel rules
- Monitor positions and event logs
- Check worker status

**Important:** The Trade Manager is now integrated into the Vincent backend. All trade rule endpoints are under `http://localhost:3000/api/skills/polymarket/rules/...` — use the same API key as the Polymarket skill.

## Testing Workflow

Follow this workflow to test both skills working together:

### Phase 1: Read the Skills

1. Read the Polymarket skill file completely
2. Read the Trade Manager skill file completely
3. Understand how they work together (see "Complete Workflow" section in Trade Manager skill)

### Phase 2: Test Polymarket Skill

1. Check your Polymarket wallet balance
2. Search for the active "Bitcoin Up or Down - 5 min" market. Use the current active market so the test doesn't take forever to run, which would happen if you chose a 5 minute market in the future.
3. Place a $2 test bet on UP outcome. You should have enough funds - let me know if you need more.

### Phase 3: Test Trade Manager Skill

1. Check the worker status to confirm the monitoring worker is running:
   ```bash
   curl http://localhost:3000/api/skills/polymarket/rules/status \
     -H "Authorization: Bearer <API_KEY>"
   ```
2. Create a trailing stop-loss rule on the position you just bought (just make one up that makes sense, since we're just testing)
3. List your active rules to confirm it was created
4. Sleep until the market expires (should be 5 mins max, but if you can tell when it will expire, use that as the sleep time) and check the event log to see if the rule triggered and the trade was executed

## Success Criteria

After testing, you should be able to show that the trade manager rules work and that betting in general works as expected.

## Report Your Findings

After testing, provide a report including any discrepancies or issues you encounter, so that we can fix them. You can view the logs for the Vincent Backend by running `docker compose logs -f` or checking stdout from the running `npm run dev` process. Also document any suggestions for improvement that you have. You have the whole Vincent monorepo available, so if you want to investigate the code to try and figure out what happened and how to fix it, you should do that.

## Important Notes

- **You are testing the skill documentation** - not just the API endpoints
- **A real agent will only have the SKILL.md files** - they won't have this LOCAL_TESTING_PROMPT.md
- **Your goal** is to verify that the skill files contain enough information for an agent to use the features successfully, and that everything works as expected.
- **If you can't figure something out from the skill files** - that's valuable feedback! Report what was unclear.
- **Use `http://localhost:3000` everywhere** - do NOT use `https://heyvincent.ai` for this local test.

## Getting Help

If you encounter issues:

- Check the skill files for error handling sections
- Check the worker status endpoint for health issues
- Look at event logs for detailed error messages
- Ask the user if you need clarification on setup
