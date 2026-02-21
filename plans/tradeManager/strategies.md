# Strategy Layer — Trade Manager Extension

> New section for `plans/tradeManager/plan.md`, extending the existing trade manager with strategy support.
> Slots in after the current Phase 6 (Deployment & Integration) as the next body of work.

## Overview

The trade manager currently operates at the **rule** level: individual SL/TP rules on individual positions. The strategy layer adds a level above that:

```
Strategy (template + thesis + risk profile)
  └─ owns N TradeRules (each with SL/TP)
       └─ each rule runs through an execution pipeline:
            trigger → evaluator → execute/hold/adjust
```

The key architectural addition is a **rule evaluator** — a hook in the execution pipeline between "trigger fired" and "execute trade". Today there are two evaluators:

| Evaluator | Behavior | Used by |
|-----------|----------|---------|
| `auto` | Execute immediately. No evaluation. Current behavior. | Mechanical strategies (mean-reversion, arbitrage, breakout, dip-buying) |
| `agent` | Wake the LLM agent to evaluate against the strategy thesis before deciding. | Thesis-driven strategies (attention-breakout, event-driven, sentiment-shift, dev-activity, risk-off, relative-strength, custom) |

This is a clean extension point. The worker's execution path becomes:

```
Rule triggered (price crossed threshold)
  → look up rule.evaluator
  → call evaluator.evaluate(rule, strategy, marketState)
  → evaluator returns: EXECUTE | HOLD | ADJUST
  → act on decision
```

Future evaluators (quant model, external signal check, human approval, webhook, etc.) plug in the same way — implement the interface, register it, assign it to a template.

---

## What Changes in the Existing Architecture

### Data Model

Add `Strategy` model:

```prisma
model Strategy {
  id              String   @id @default(uuid())
  templateId      String          // "attention-breakout", "mean-reversion", etc.
  name            String
  thesis          String          // User's belief text
  riskProfile     String          // "Conservative" | "Moderate" | "Aggressive"
  riskConstraints String          // JSON: { maxAllocation, dailyLossLimit, stopLoss, takeProfit }
  evaluator       String          // "auto" | "agent" (from template registry)
  status          String          // PENDING | ACTIVE | PAUSED | STOPPED
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  tradeRules      TradeRule[]
}
```

Extend `TradeRule` with:

```prisma
model TradeRule {
  // ... existing fields ...
  strategyId  String?
  strategy    Strategy? @relation(fields: [strategyId], references: [id])
  evaluator   String   @default("auto")  // inherited from strategy at creation
}
```

New rule statuses: `AWAITING_EVAL`, `EVAL_HOLD` (in addition to existing ACTIVE, TRIGGERED, CANCELED, EXPIRED, FAILED).

### Template Registry

```typescript
interface StrategyTemplate {
  evaluator: 'auto' | 'agent';  // extensible — add new evaluator types here
}

const STRATEGY_TEMPLATES: Record<string, StrategyTemplate> = {
  // Auto-execute (pure SL/TP)
  'mean-reversion':  { evaluator: 'auto' },
  'arbitrage':       { evaluator: 'auto' },
  'breakout':        { evaluator: 'auto' },
  'dip-buying':      { evaluator: 'auto' },

  // Agent-evaluated
  'attention-breakout': { evaluator: 'agent' },
  'event-driven':       { evaluator: 'agent' },
  'sentiment-shift':    { evaluator: 'agent' },
  'dev-activity':       { evaluator: 'agent' },
  'risk-off':           { evaluator: 'agent' },
  'relative-strength':  { evaluator: 'agent' },
  'custom':             { evaluator: 'agent' },
};
```

### Evaluator Interface

```typescript
interface EvalResult {
  decision: 'EXECUTE' | 'HOLD' | 'ADJUST';
  adjustedPrice?: number;    // only if ADJUST
  reasoning: string;         // logged to RuleEvent
}

interface RuleEvaluator {
  evaluate(
    rule: TradeRule,
    strategy: Strategy,
    marketState: { currentPrice: number; recentPrices: number[] }
  ): Promise<EvalResult>;
}
```

Two implementations:

**AutoEvaluator**: Returns `{ decision: 'EXECUTE' }` immediately. Zero overhead.

**AgentEvaluator**: Calls the LLM with the strategy thesis, triggered rule, and market context. The agent asks itself: *"My thesis is X. Price just hit my stop-loss/take-profit. Is this actually a good time to execute?"* Returns EXECUTE, HOLD, or ADJUST with reasoning.

### Worker Changes

The existing `monitoringWorker` evaluation loop changes from:

```
// before
if (priceHitsThreshold) → executeTrade()
```

to:

```
// after
if (priceHitsThreshold) {
  const evaluator = getEvaluator(rule.evaluator);
  const result = await evaluator.evaluate(rule, strategy, marketState);
  switch (result.decision) {
    case 'EXECUTE': executeTrade(); break;
    case 'HOLD':    markRuleHeld(rule, result.reasoning); break;
    case 'ADJUST':  updateTriggerPrice(rule, result.adjustedPrice); break;
  }
}
```

The `getEvaluator()` function is a simple registry lookup. `auto` → AutoEvaluator, `agent` → AgentEvaluator.

**Timeout safety**: AgentEvaluator has a 30s timeout. If the LLM is unreachable, it falls back to `{ decision: 'EXECUTE' }`. An unavailable agent should never leave a position unprotected.

### New API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/strategies` | Create strategy + place initial bets + create SL/TP rules |
| `GET` | `/api/strategies` | List strategies |
| `GET` | `/api/strategies/:id` | Get strategy with linked rules and positions |
| `PATCH` | `/api/strategies/:id` | Pause/resume/stop |
| `DELETE` | `/api/strategies/:id` | Stop + cancel all active rules |

Existing `/api/rules` endpoints continue to work. Rules created through a strategy just have `strategyId` and `evaluator` set.

---

## Strategy Templates & Trigger Behavior

Each wizard template (PR #16) maps to an evaluator. The template determines behavior, not the user.

### Auto-Execute (`evaluator: 'auto'`)

Mechanical — price hits trigger, sell immediately.

| Template | Name | Why |
|----------|------|-----|
| `mean-reversion` | Mean Reversion Guardrail | Hard exits are the whole point |
| `arbitrage` | Funding Basis Capture | Defined exits, mechanical by nature |
| `breakout` | Momentum Breakout | Structured entries/exits, rules are crisp |
| `dip-buying` | Dip-Buying Structure | Strict stops, no second-guessing |

### Agent-Evaluated (`evaluator: 'agent'`)

Thesis-driven — agent checks if the thesis still holds before executing.

| Template | Name | Why |
|----------|------|-----|
| `attention-breakout` | AI Attention Breakout | A dip might be temporary in a building narrative |
| `event-driven` | Event-Driven Probability | Price dip before event resolution isn't necessarily a reason to exit |
| `sentiment-shift` | Sentiment Shift Tracker | Agent checks if the sentiment shift is still intact |
| `dev-activity` | Developer Momentum | Price noise shouldn't trigger exits if dev momentum is strong |
| `risk-off` | Risk Regime Strategy | Agent assesses if the regime has actually shifted |
| `relative-strength` | Relative Strength Rotation | Agent checks if relative strength thesis still holds |
| `custom` | Custom Strategy | Agent evaluates against whatever the user wrote |

---

## Initial Bet Placement

```
POST /api/strategies
Body: {
  templateId,                              // determines evaluator
  name, thesis, riskProfile,
  positions: [
    { marketId, tokenId, side, size }      // what to buy
  ]
}

→ StrategyService.create():
    1. Look up template → get evaluator type
    2. Look up risk constraints for riskProfile:
       - Conservative: 4% SL, 8% TP, 2% max allocation, $150 daily loss
       - Moderate:     6% SL, 12% TP, 3% max allocation, $250 daily loss
       - Aggressive:   8% SL, 18% TP, 5% max allocation, $500 daily loss
    3. Validate positions against constraints
    4. Persist Strategy (status: PENDING, evaluator from template)
    5. For each position:
       a. Execute buy via Vincent Polymarket API
       b. Record entry price
       c. Create STOP_LOSS rule at (entry - SL%), evaluator from strategy
       d. Create TAKE_PROFIT rule at (entry + TP%), evaluator from strategy
       e. Link to strategy
    6. Strategy status → ACTIVE
    7. Return strategy + positions + rules
```

The caller (wizard backend / agent) decides which markets and positions. The trade manager executes, attaches SL/TP, and routes triggers through the correct evaluator.

---

## Strategy Lifecycle

### Statuses

- **PENDING** — created, initial bets being placed
- **ACTIVE** — monitoring, rules firing, daily loss tracking
- **PAUSED** — SL/TP rules stay active (protection continues), daily loss monitoring pauses
- **STOPPED** — all rules canceled, positions remain for manual management

### Daily Loss Limit

Runs every worker cycle for each ACTIVE strategy:
1. Sum realized losses today (from fired SL rules) + unrealized losses
2. If total >= dailyLossLimit → sell all positions, cancel all rules, stop strategy
3. **Always auto-executes** — bypasses evaluator. This is a hard safety cap.

### Strategy Completion

When all rules for a strategy have resolved (TRIGGERED, CANCELED, or EVAL_HOLD) and all positions are closed → strategy auto-stops.

---

## Implementation Phases

> These extend the existing trade manager plan as Phases 10-15, following the current Phase 9 (Post-MVP Enhancements).

### Phase 10: Strategy Data Model & Template Registry
- Add Strategy model to Prisma schema
- Extend TradeRule with strategyId + evaluator
- Add AWAITING_EVAL and EVAL_HOLD to rule status enum
- Hardcode template registry with evaluator mappings
- Run migration

### Phase 11: Strategy CRUD & Initial Bet Execution
- Implement strategy API endpoints (create, list, get, patch, delete)
- Risk profile lookup and position size validation
- Wire POST /api/strategies to execute buys via Vincent API
- Auto-create SL/TP rules with evaluator from template
- Handle partial failures on bet placement

### Phase 12: Evaluator Interface & Auto Evaluator
- Define RuleEvaluator interface
- Implement AutoEvaluator (returns EXECUTE immediately)
- Evaluator registry (getEvaluator lookup)
- Refactor worker to route through evaluator on trigger
- All existing behavior preserved (auto is the default)

### Phase 13: Agent Evaluator
- Implement AgentEvaluator (LLM call with strategy context)
- Prompt construction: thesis + rule + market state → structured response
- Parse EXECUTE / HOLD / ADJUST decisions
- 30s timeout with fallback to EXECUTE
- ADJUST: update trigger price, re-arm rule
- Log reasoning + decision in RuleEvent

### Phase 14: Strategy Lifecycle
- Strategy-aware rule tracking (auto-stop when all resolved)
- Daily loss limit enforcement (bypasses evaluator)
- Pause/resume/stop transitions
- Strategy-level event logging

### Phase 15: Testing
- Template registry + risk constraint validation
- Full lifecycle: strategy → buy → trigger → evaluate → sell
- Agent evaluator: mock LLM returning EXECUTE/HOLD/ADJUST
- Timeout/failure: fallback to auto-execute
- Daily loss limit: bypasses agent evaluator
- Edge cases: partial fills, concurrent triggers, API failures

---

## Future Generalization

The evaluator interface is the extension point. New evaluators plug in without changing the worker, rule model, or strategy flow:

| Future evaluator | What it does |
|-----------------|-------------|
| `webhook` | POST to external URL, expect EXECUTE/HOLD/ADJUST response |
| `quant` | Run a local model / scoring function instead of LLM |
| `human` | Send notification, wait for user approval in app |
| `composite` | Chain multiple evaluators (e.g., quant pre-filter → agent) |

To add one: implement `RuleEvaluator`, register it, add it to a template.

---

## OpenClaw Integration

The OpenClaw agent is the **caller** of the trade manager API. Today, the agent creates individual SL/TP rules via `POST /api/rules` (as documented in `skills/trade-manager/SKILL.md`). With strategies, the agent will call `POST /api/strategies` instead, which handles bet placement + rule creation in one call.

**No changes needed inside the trade manager for OpenClaw.** The trade manager just exposes HTTP endpoints — it doesn't know or care that OpenClaw is calling them. The integration boundary is the local API on `localhost:19000`.

**What does need updating (owned by Chris / OpenClaw work):**
- `skills/trade-manager/SKILL.md` — add strategy endpoints, example prompts for strategy creation
- `openclaw/SOUL.md` — may need guidance on when to use strategies vs individual rules
- The OpenClaw agent needs to know about templates, risk profiles, and how to translate a user's thesis into a `POST /api/strategies` call with specific positions

The trade manager is a dumb executor with a smart hook. OpenClaw is the smart caller. That separation is intentional and should stay clean.

---

## Open Questions

1. **Position selection**: Does the caller send specific `{ marketId, tokenId, side, size }`, or does the trade manager resolve markets from the thesis?
2. **Partial failure**: If 3/5 bets succeed and 2 fail — ACTIVE with 3, or roll back?
3. **Daily loss limit scope**: Per-strategy or global across all strategies?
4. **Agent provider**: Which LLM? Direct from trade-manager, or via Vincent backend?
5. **EVAL_HOLD re-arming**: Permanently disarmed, or re-arm after cooldown / at new threshold?
