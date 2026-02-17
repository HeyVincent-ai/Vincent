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

Read these skill files to understand how to use both services:

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
2. Search for active markets
3. (Optional) Place a small test bet if you have funds

### Phase 3: Test Trade Manager Skill

1. Create a stop-loss rule on a position (or test position)
2. Create a take-profit rule on the same position
3. List your active rules
4. Update a rule's trigger price
5. Check the event log
6. Cancel a rule

### Phase 4: Verify Integration

1. Confirm Trade Manager worker is monitoring your positions
2. Check that events are being logged every 15 seconds
3. Verify circuit breaker state is healthy

## What to Test

Based on the skills you read, test these scenarios:

**From Polymarket Skill:**

- Can you search markets?
- Can you get wallet balance?
- Can you understand market structure (outcomes, prices, tokenIds)?

**From Trade Manager Skill:**

- Can you create rules with correct parameters?
- Can you list rules with status filters?
- Can you update trigger prices?
- Can you cancel rules?
- Can you view event logs?

**Integration:**

- Do the rules use the same API key as Polymarket?
- Do the marketId and tokenId from Polymarket work in Trade Manager?
- Does the worker fetch positions correctly?

## Success Criteria

After testing, you should be able to:

✅ Explain how both skills work together
✅ Create stop-loss and take-profit rules successfully
✅ Monitor rule status and events
✅ Understand when rules will trigger
✅ Troubleshoot common errors

## Report Your Findings

After testing, provide a report including:

1. **What worked:**
   - Which endpoints succeeded
   - Which workflows completed end-to-end

2. **What needs clarification:**
   - Confusing documentation
   - Missing information
   - Ambiguous instructions

3. **Integration observations:**
   - Did the skills work well together?
   - Was it clear how to get the right IDs from Polymarket to use in Trade Manager?
   - Were there any gaps in the documentation?

4. **Suggestions for improvement:**
   - What would make the skills easier to use?
   - What examples would be helpful?
   - What common errors should be documented?

## Important Notes

- **You are testing the skill documentation** - not just the API endpoints
- **A real agent will only have the SKILL.md files** - they won't have this LOCAL_TESTING_PROMPT.md
- **Your goal** is to verify that the skill files contain enough information for an agent to use the features successfully
- **If you can't figure something out from the skill files** - that's valuable feedback! Report what was unclear.

## Getting Help

If you encounter issues:

- Check the skill files for error handling sections
- Check the Trade Manager worker status for health issues
- Look at event logs for detailed error messages
- Ask the user if you need clarification on setup

Good luck! 🚀
