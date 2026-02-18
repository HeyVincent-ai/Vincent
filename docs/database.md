# Database Schema

Vincent uses PostgreSQL via Prisma ORM. The schema lives at `prisma/schema.prisma`.

The trade manager has its own separate SQLite schema at `trade-manager/prisma/schema.prisma` — see [Trade Manager](./features/trade-manager.md).

## Core Models

### User

Represents an authenticated user (via Stytch).

| Field | Type | Notes |
|---|---|---|
| `id` | String (cuid) | Primary key |
| `email` | String | Unique, from Stytch |
| `stytchUserId` | String | Unique, Stytch user ID |
| `telegramUsername` | String? | For approval bot |
| `telegramChatId` | String? | Set when user links with bot |
| `stripeCustomerId` | String? | Stripe customer ID |
| `referralCode` | String? | Unique referral code |
| `dataSourceCreditUsd` | Decimal | Default $10.00, credit pool for data sources |

**Relations:** secrets, subscriptions, openclawDeployments, referrals

### Secret

A stored secret value (private key, credentials, etc.) that agents use but never see.

| Field | Type | Notes |
|---|---|---|
| `id` | String (cuid) | Primary key |
| `userId` | String? | Null until claimed |
| `type` | SecretType enum | `EVM_WALLET`, `DATA_SOURCES`, etc. |
| `value` | String? | The actual secret (private key). Null for DATA_SOURCES |
| `memo` | String? | User-facing description |
| `claimToken` | String? | One-time claim token (64-char hex) |
| `claimedAt` | DateTime? | When user claimed |
| `deletedAt` | DateTime? | Soft delete |

**Relations:** apiKeys, policies, walletMetadata, polymarketCredentials, transactionLogs, auditLogs

### SecretType Enum

```
EVM_WALLET, POLYMARKET_WALLET, RAW_SIGNER, API_KEY, SSH_KEY, OAUTH_TOKEN, DATA_SOURCES
```

### ApiKey

Agent authentication tokens, scoped to one secret.

| Field | Type | Notes |
|---|---|---|
| `id` | String (cuid) | Primary key |
| `secretId` | String | FK to Secret |
| `keyHash` | String | bcrypt hash of the key |
| `name` | String? | Optional label |
| `revokedAt` | DateTime? | Null = active |

API key format: `ssk_<64 hex chars>`. Only shown once on creation. Validated by iterating all non-revoked keys and bcrypt-comparing.

### Policy

Rules governing how a secret can be used.

| Field | Type | Notes |
|---|---|---|
| `id` | String (cuid) | Primary key |
| `secretId` | String | FK to Secret |
| `policyType` | PolicyType enum | e.g., `ADDRESS_ALLOWLIST`, `SPENDING_LIMIT_PER_TX` |
| `config` | Json | Policy-specific configuration |

One policy per type per secret (enforced in service layer). See [Policy Engine](./backend/policies.md) for the 8 policy types and their config schemas.

## Wallet Models

### WalletSecretMetadata

Extended metadata for `EVM_WALLET` secrets.

| Field | Type | Notes |
|---|---|---|
| `smartAccountAddress` | String | ZeroDev smart account address |
| `ownershipTransferred` | Boolean | Whether user took ownership |
| `ownerAddress` | String? | User's EOA after transfer |
| `chainsUsed` | Int[] | Chains where wallet has been used |
| `sessionKeyData` | String? | Serialized permission account for post-transfer signing |
| `transferredAt` | DateTime? | When ownership was transferred |
| `transferTxHash` | String? | Recovery transaction hash |

### PolymarketCredentials

CLOB API credentials derived lazily on first Polymarket operation.

| Field | Type | Notes |
|---|---|---|
| `secretId` | String | FK to Secret |
| `apiKey` | String | CLOB API key |
| `secret` | String | CLOB secret |
| `passphrase` | String | CLOB passphrase |

### RawSignerMetadata

For `RAW_SIGNER` secrets — stores derived addresses.

| Field | Type | Notes |
|---|---|---|
| `ethereumAddress` | String? | Derived Ethereum address |
| `solanaAddress` | String? | Derived Solana address |

## Transaction & Audit Models

### TransactionLog

Records every skill execution attempt.

| Field | Type | Notes |
|---|---|---|
| `secretId` | String | FK to Secret |
| `apiKeyId` | String? | Which API key was used |
| `actionType` | String | `transfer`, `send_transaction`, `swap`, `bet`, etc. |
| `requestData` | Json | Full request input (includes `usdValue` for spending tracking) |
| `responseData` | Json? | Full response output |
| `status` | String | `executed`, `denied`, `pending_approval`, `failed` |

### PendingApproval

Telegram approval requests waiting for user response.

| Field | Type | Notes |
|---|---|---|
| `transactionLogId` | String | FK to TransactionLog |
| `expiresAt` | DateTime | Auto-deny deadline |
| `approved` | Boolean? | Null = pending, true = approved, false = denied |
| `telegramMessageId` | Int? | For reference |

### AuditLog

Comprehensive append-only log of all actions.

| Field | Type | Notes |
|---|---|---|
| `secretId` | String? | FK to Secret |
| `apiKeyId` | String? | Which API key (if agent action) |
| `userId` | String? | Which user (if frontend action) |
| `action` | String | e.g., `skill.transfer`, `policy.create`, `secret.claim` |
| `inputData` | Json? | Sanitized request input |
| `outputData` | Json? | Response output |
| `status` | String | `SUCCESS`, `FAILED`, `PENDING` |
| `errorMessage` | String? | If failed |
| `durationMs` | Int? | For skill executions |
| `ipAddress` | String? | Caller's IP |
| `userAgent` | String? | Caller's user agent |

## Billing Models

### Subscription

Stripe subscription tracking for the $10/month pro tier.

| Field | Type | Notes |
|---|---|---|
| `userId` | String | FK to User |
| `stripeSubscriptionId` | String | Stripe subscription ID |
| `status` | String | `active`, `canceled`, `past_due` |
| `currentPeriodStart` | DateTime? | Current billing period start |
| `currentPeriodEnd` | DateTime? | Current billing period end |

### GasUsage

Per-transaction gas costs for EVM wallet operations.

| Field | Type | Notes |
|---|---|---|
| `secretId` | String | FK to Secret |
| `userId` | String | FK to User |
| `transactionHash` | String | On-chain tx hash |
| `chainId` | Int | Chain where gas was used |
| `gasUsed` | BigInt | Gas units consumed |
| `gasPriceGwei` | Decimal | Gas price |
| `costUsd` | Decimal | USD cost of gas |

### MonthlyGasSummary

Aggregated monthly gas billing.

| Field | Type | Notes |
|---|---|---|
| `userId` | String | FK to User |
| `month` | String | Format: `YYYY-MM` |
| `totalCostUsd` | Decimal | Sum of gas costs for the month |
| `billed` | Boolean | Whether invoice has been created |

### DataSourceUsage / DataSourceCreditPurchase

Per-call usage tracking and credit purchase records for data source proxy. See [Data Sources](./features/data-sources.md).

## OpenClaw Models

### OpenClawDeployment

Tracks VPS deployments for the OpenClaw 1-click deploy feature.

| Field | Type | Notes |
|---|---|---|
| `userId` | String | FK to User |
| `ovhServiceName` | String? | OVH VPS service identifier |
| `ipAddress` | String? | VPS IP address |
| `accessToken` | String? | OpenClaw gateway auth token |
| `openRouterKeyHash` | String? | For key management/revocation |
| `status` | OpenClawStatus enum | See below |
| `stripeSubscriptionId` | String? | $25/mo subscription |
| `creditBalanceUsd` | Decimal | LLM credit balance (starts at $25) |
| `lastKnownUsageUsd` | Decimal | Polled from OpenRouter |
| `vincentSecretIds` | Json? | Pre-provisioned secret IDs |

**OpenClawStatus enum:** `PENDING_PAYMENT`, `PENDING`, `ORDERING`, `PROVISIONING`, `INSTALLING`, `READY`, `CANCELING`, `ERROR`, `DESTROYING`, `DESTROYED`

### OpenClawCreditPurchase

Records credit top-ups for OpenClaw LLM usage.

### VpsPool

Pre-provisioned VPS pool for faster deployment.

### Referral

Referral tracking between users.
