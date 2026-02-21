# Telegram Approval Bot

The Telegram bot enables human-in-the-loop approval for policy-gated actions. When a policy requires approval (via `REQUIRE_APPROVAL` or `APPROVAL_THRESHOLD`), the bot sends the user a message with Approve/Deny inline buttons.

## How It Works

### User Linking

1. User sets their Telegram username in the frontend (`PUT /api/user/telegram`)
2. User generates a linking code (`POST /api/user/telegram/link`) — 10-minute expiry, in-memory storage
3. User sends `/start <code>` to the Vincent Telegram bot
4. Bot verifies the code and stores the user's `telegramChatId`
5. User is now linked and can receive approval requests

### Approval Flow

```
Agent requests action → Policy says "require_approval"
  → TransactionLog created with status 'pending_approval'
  → PendingApproval record created with expiry
  → Bot sends message to user with:
      - Formatted transaction details
      - Inline keyboard: [Approve] [Deny]
  → Agent receives response: { status: 'pending_approval' }

User taps Approve:
  → Bot validates: correct user, not expired, not already responded
  → Calls approvalExecutor to re-read wallet data and execute via ZeroDev
  → Updates TransactionLog to 'executed'
  → Bot sends confirmation message

User taps Deny:
  → Updates TransactionLog to 'denied'
  → Bot sends denial message

Timeout (no response):
  → Background job (every 60s) checks for expired PendingApprovals
  → Marks as DENIED with TIMEOUT status
  → Sends timeout notification to user
```

### Bot Commands

| Command | Description |
|---|---|
| `/start <code>` | Link Telegram account with linking code |
| `/status` | Check linking status |
| `/unlink` | Unlink Telegram account |

## Architecture

**Library:** grammy (better TypeScript support than node-telegram-bot-api)

**Mode:** Long polling (not webhooks). Simpler for development; can switch to webhooks for production.

**Lifecycle:** Bot starts/stops with the Express server in `src/index.ts`.

**Linking codes:** Stored in-memory with 10-minute expiry. Sufficient for single-instance deployment; would need Redis for multi-instance.

### Separation of Concerns

- `src/telegram/bot.ts` — Bot initialization, command handlers, callback query handling, message sending
- `src/telegram/approvalExecutor.ts` — Executes approved transactions (separate module to avoid circular deps with `evmWallet.service`)
- `src/telegram/timeoutChecker.ts` — `setInterval` (60s) that expires timed-out pending approvals

The approval executor is deliberately separate from `evmWallet.service.ts` because the approval flow needs to re-read the wallet data and execute the transaction independently of the original request context.

## Key Decisions

- Fire-and-forget pattern: `sendApprovalRequest()` is called without awaiting from `evmWallet.service`. The API response to the agent returns immediately with `pending_approval` status.
- The bot stores its `telegramMessageId` on the `PendingApproval` record for reference.
- Telegram chat ID is reset when the username changes (forces re-linking).
- Timeout checker runs as a simple `setInterval` — could be upgraded to a proper job queue for production.

## Files

- `src/telegram/bot.ts` — Main bot module
- `src/telegram/approvalExecutor.ts` — Transaction execution after approval
- `src/telegram/timeoutChecker.ts` — Expiry checker
- `src/api/routes/user.routes.ts` — `POST /api/user/telegram/link` endpoint
