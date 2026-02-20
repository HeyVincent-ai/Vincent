# Policy Engine

Policies govern how secrets can be used. They are the primary safety mechanism between an agent's request and actual execution.

## How It Works

1. User creates policies on their secret via the frontend (or API)
2. When an agent requests an action, the policy checker evaluates all policies for that secret
3. Verdict is one of: **allow**, **deny**, or **require_approval**
4. Denied actions fail immediately. Approval-required actions go to Telegram.

**Default-open:** If no policies exist for a secret, all actions are allowed.

## Two-Phase Evaluation

The checker runs in two phases:

1. **Deny phase:** Check restrictive policies (allowlists, spending limits). If any deny, the action is denied immediately.
2. **Approval phase:** Check approval policies (require_approval, approval_threshold). If any require approval, the action goes to Telegram.

If both phases pass, the action is allowed.

## Policy Types

### Restrictive Policies (Deny Phase)

| Type | Config | Behavior |
|---|---|---|
| `ADDRESS_ALLOWLIST` | `{ addresses: string[] }` | `to` address must be in list. Applies to transfer + sendTx |
| `FUNCTION_ALLOWLIST` | `{ selectors: string[] }` | 4-byte function selector must be in list. Applies to sendTx only |
| `TOKEN_ALLOWLIST` | `{ tokens: string[] }` | ERC20 token address must be in list. Applies to transfer only |
| `SPENDING_LIMIT_PER_TX` | `{ maxUsd: number }` | USD value per transaction must not exceed limit |
| `SPENDING_LIMIT_DAILY` | `{ maxUsd: number }` | Rolling 24-hour USD spending must not exceed limit |
| `SPENDING_LIMIT_WEEKLY` | `{ maxUsd: number }` | Rolling 7-day USD spending must not exceed limit |

**Allowlist behavior:** If an allowlist policy exists, the action MUST match — otherwise it's denied. If the allowlist policy doesn't exist, there's no restriction.

**Spending limit tracking:** USD values are stored in `TransactionLog.requestData.usdValue` at execution time. Daily/weekly limits query recent TransactionLogs within the rolling window.

**Price conversion:** Uses CoinGecko via `price.service.ts` with 5-minute cache. If price is unavailable: spending limits **deny** (safe default), approval thresholds **require approval** (safe default).

### Approval Policies (Approval Phase)

| Type | Config | Behavior |
|---|---|---|
| `REQUIRE_APPROVAL` | `{ enabled: boolean }` | Always requires human approval when enabled |
| `APPROVAL_THRESHOLD` | `{ thresholdUsd: number }` | Requires approval above USD threshold |

## Policy Checker Interface

**File:** `src/policies/checker.ts`

```
checkPolicies(secretId, actionType, actionData) → PolicyVerdict
```

Where `PolicyVerdict` is:
- `{ allowed: true }` — execute immediately
- `{ allowed: false, reason: string }` — deny with explanation
- `{ requiresApproval: true, reason: string }` — send to Telegram

**`actionType`** is `'transfer'` or `'send_transaction'` — determines which policies apply.

**`actionData`** includes: `to`, `value`, `usdValue`, `token`, `data` (function selector), `amount`.

## How Skills Use Policies

Every skill execution follows this pattern (from `evmWallet.service.ts`):

```
1. Build actionData (to, value, usdValue via CoinGecko, etc.)
2. Call checkPolicies(secretId, actionType, actionData)
3. If denied → create TransactionLog with status 'denied', return error
4. If requiresApproval → create TransactionLog with status 'pending_approval',
   create PendingApproval record, send Telegram notification, return pending
5. If allowed → execute on-chain, create TransactionLog with status 'executed'
```

Polymarket bets reuse the same spending limit policies by treating the bet amount as a `transfer`-type action.

Swaps check policies twice: once for spending limits (sell amount), once for token allowlist (sell token).

## One Policy Per Type Per Secret

Enforced in the service layer (not DB constraint). Creating a duplicate type returns 409 Conflict. To change a policy's config, use PUT (update) or delete + recreate.

## Files

- `src/policies/checker.ts` — All 8 checker implementations + `checkPolicies()` orchestrator
- `src/services/policy.service.ts` — CRUD + Zod config validation schemas per type
- `src/services/price.service.ts` — CoinGecko price oracle
- `src/api/routes/policies.routes.ts` — REST API endpoints
