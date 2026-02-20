# Local Testing Guide for AI Agent

**You are an AI agent testing the Trade Manager skill locally.**

## Your Mission

Test the Trade Manager skill by actually using it alongside the Polymarket skill. Read the skill documentation files, understand how they work together, and use them to place bets and set automated stop-loss/take-profit rules.

## Setup Verification

Before you start, verify your environment is ready:

```bash
# 1. Check Trade Manager is running
curl http://localhost:19000/health

# 2. Check worker status
curl http://localhost:19000/status

# 3. Verify you have access to Vincent Polymarket API
# (Your API key should be in ~/.openclaw/credentials/agentwallet/ or provided by the user)
```

If any of these fail, ask the user for help setting up the environment.

## Skill Documentation

Read these skill files to understand how to use both services. We are testing locally when talking to the Vincent API do not use the https://heyvincent.ai URL and use our local dev url http://localhost:3000 instead.

### 1. Polymarket Skill

**Location:** `../skills/polymarket/SKILL.md` (relative to this file) OR `/Users/chris/Documents/WorkStuff/Lit/skills/SafeSkills-2/skills/polymarket/SKILL.md`

This skill explains how to:

- Create a Polymarket wallet
- Browse and search markets
- Place bets (BUY/SELL)
- View positions and balances
- Manage orders

### 2. Trade Manager Skill

**Location:** `skills/trade-manager/SKILL.md` (in the trade-manager directory) OR `/Users/chris/Documents/WorkStuff/Lit/skills/SafeSkills-2/skills/trade-manager/SKILL.md`

This skill explains how to:

- Create stop-loss rules (sell if price drops)
- Create take-profit rules (sell if price rises)
- List, update, and cancel rules
- Monitor positions and event logs
- Use Trade Manager alongside Polymarket

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

1. Create a trailing stop-loss rule on the position you just bought (just make one up that makes sense, since we're just testing)
2. List your active rules to confirm it was created
3. Sleep until the market expires (should be 5 mins max, but if you can tell when it will expire, use that as the sleep time) and check the event log to see if the rule triggered and the trade was executed

## Success Criteria

After testing, you should be able to show that the trade manager rules work and that betting in general works as expected.

## Report Your Findings

After testing, provide a report including any discrepancies or issues you encounter, so that we can fix them. You can view the logs for the Vincent Backend in the `trade-manager/testRunLogs/<dateTimeStamp>/vincentBackend.log` file to see what happened during the test. You can view the logs for the Trade Manager in the `trade-manager/testRunLogs/<dateTimeStamp>/tradeManager.log` file. You can review the logs as needed to try to figure out what happened and what went right or wrong. Also document any suggestions for improvement that you have. You have the whole vincent monorepo available with the trade-manager and vincent Backend so if you want to investigate the code to try and guess what went wrong and how to fix it, you should do that.

## Important Notes

- **You are testing the skill documentation** - not just the API endpoints
- **A real agent will only have the SKILL.md files** - they won't have this LOCAL_TESTING_PROMPT.md
- **Your goal** is to verify that the skill files contain enough information for an agent to use the features successfully, and that everything works as expected.
- **If you can't figure something out from the skill files** - that's valuable feedback! Report what was unclear.

## Getting Help

If you encounter issues:

- Check the skill files for error handling sections
- Check the Trade Manager worker status for health issues
- Look at event logs for detailed error messages
- Ask the user if you need clarification on setup

Good luck! 🚀
