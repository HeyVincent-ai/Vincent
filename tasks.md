# SafeSkills - Implementation Tasks

## Phase 1: Project Setup & Infrastructure

### 1.1 Project Initialization
- [x] Initialize Node.js/TypeScript project with proper tsconfig
- [x] Set up ESLint and Prettier
- [x] Create folder structure:
  ```
  /src
    /api          # Express routes
    /services     # Business logic
    /skills       # Skill implementations
    /policies     # Policy checking logic
    /db           # Prisma client & utilities
    /types        # TypeScript types
    /utils        # Helpers
    /telegram     # Telegram bot
    /audit        # Audit logging
    /billing      # Stripe integration & gas tracking
  /prisma         # Schema & migrations
  /frontend       # React app (separate or monorepo)
  ```
- [x] Set up environment variable management (.env, validation)

### 1.2 Database Setup
- [x] Install and configure Prisma
- [x] Create initial Prisma schema:
  - [x] User model (include stripe_customer_id)
  - [x] Secret model
  - [x] WalletSecretMetadata model
  - [x] ApiKey model
  - [x] Policy model
  - [x] AuditLog model (comprehensive logging with inputs/outputs)
  - [x] PendingApproval model
  - [x] Subscription model (Stripe subscription tracking)
  - [x] GasUsage model (per-transaction gas costs)
  - [x] MonthlyGasSummary model (aggregated monthly billing)
- [ ] Create initial migration (requires local PostgreSQL or DATABASE_URL)
- [x] Set up database seeding for development

### 1.3 Core Backend Infrastructure
- [x] Set up Express server with TypeScript
- [x] Configure middleware (cors, body-parser, helmet, rate-limiting)
- [x] Set up error handling middleware
- [x] Create base API response helpers
- [x] Set up request logging (structured JSON logs)
- [x] Configure health check endpoint

---

## Phase 2: Secret Storage Foundation

### 2.1 Secret CRUD Operations
- [x] Implement secret creation service
  - [x] Generate unique ID
  - [x] For generated secrets (wallets): create and store the secret value
  - [x] For future user-provided secrets: create placeholder with null value
  - [x] Generate claim token
  - [x] Store in database (PostgreSQL encrypted at rest)
- [x] Implement secret retrieval (metadata only, never raw value to agents)
- [x] Implement secret claiming
  - [x] Validate claim token
  - [x] Associate with user
  - [x] Mark as claimed
  - [x] Invalidate claim token
- [x] Implement secret value setting (for future user-provided secrets)
  - [x] Only allow if secret value is null
  - [x] Only allow for claimed secrets
- [x] Implement secret deletion (soft delete with audit trail)

### 2.2 API Key Management
- [x] Implement API key generation
  - [x] Generate secure random key
  - [x] Hash key with bcrypt
  - [x] Store hash, return plain key once
- [x] Implement API key validation middleware
- [x] Implement API key listing (show name, created, revoked status)
- [x] Implement API key revocation
- [x] Add API key usage tracking

---

## Phase 3: Authentication & User Management

### 3.1 Stytch Integration
- [x] Set up Stytch SDK
- [x] Implement authentication endpoints:
  - [x] Magic link flow (email)
  - [x] OAuth (Google, optional)
- [x] Handle Stytch callbacks
- [x] Create/retrieve user on successful auth
- [x] Generate session tokens

### 3.2 User API Endpoints
- [x] `GET /api/user/profile` - Get current user
- [x] `PUT /api/user/telegram` - Update Telegram username
- [x] `GET /api/user/secrets` - List user's claimed secrets

### 3.3 Authorization Middleware
- [x] Create session validation middleware
- [x] Create secret ownership validation
- [x] Create API key authentication for agent endpoints (done in Phase 2, verified working)

---

## Phase 4: Policy System

### 4.1 Policy Engine Core
- [x] Design policy configuration schema (JSON structure)
- [x] Implement policy storage/retrieval
- [x] Create policy validator (validate config structure)
- [x] Build policy checker interface

### 4.2 EVM Wallet Policies
- [x] Implement `address_allowlist` policy checker
- [x] Implement `function_allowlist` policy checker
- [x] Implement `token_allowlist` policy checker
- [x] Implement `spending_limit_per_tx` policy checker
- [x] Implement `spending_limit_daily` policy checker
  - [x] Track spending over rolling 24h window
- [x] Implement `spending_limit_weekly` policy checker
  - [x] Track spending over rolling 7-day window
- [x] Implement `require_approval` policy checker
- [x] Implement `approval_threshold` policy checker

### 4.3 USD Price Conversion
- [x] Integrate price oracle (CoinGecko or similar)
- [x] Implement ETH → USD conversion
- [x] Implement ERC20 → USD conversion
- [x] Add caching for price data (refresh every few minutes)
- [x] Handle missing/stale prices gracefully

### 4.4 Policy API Endpoints
- [x] `GET /api/secrets/:id/policies` - List policies
- [x] `POST /api/secrets/:id/policies` - Create policy
- [x] `PUT /api/secrets/:id/policies/:policyId` - Update policy
- [x] `DELETE /api/secrets/:id/policies/:policyId` - Delete policy

---

## Phase 5: EVM Wallet Skill

### 5.1 ZeroDev Integration
- [x] Set up ZeroDev SDK
- [x] Implement smart account creation from EOA
- [x] Store smart account address in WalletSecretMetadata
- [x] Implement transaction signing with EOA
- [x] Handle multiple chains (start with one, design for many)
- [x] Configure ZeroDev paymaster for gas sponsorship
  - [x] Set up testnet paymaster (always sponsor)
  - [x] Set up mainnet paymaster (sponsor if user has subscription)

### 5.2 Gas Tracking
- [x] Record gas usage for each transaction
  - [x] Capture gas used, gas price
  - [x] Convert to USD cost
  - [x] Store in GasUsage table
- [x] Implement gas usage queries
  - [x] Get usage for current billing period
  - [x] Get usage by secret/wallet
- [x] Check subscription before mainnet transactions
  - [x] If no active subscription, return error with subscribe link

### 5.3 Transfer Function
- [x] Implement ETH transfer
  - [x] Validate to address
  - [x] Build transfer transaction
  - [x] Check policies
  - [x] Execute or request approval
  - [x] Log transaction
- [x] Implement ERC20 transfer
  - [x] Fetch token decimals
  - [x] Build transfer call data
  - [x] Check policies (including token allowlist)
  - [x] Execute or request approval
  - [x] Log transaction

### 5.4 Send Transaction Function
- [x] Implement generic transaction sending
  - [x] Parse to, data, value
  - [x] Extract function selector from data
  - [x] Check policies (address, function allowlists)
  - [x] Execute or request approval
  - [x] Log transaction

### 5.5 Read-Only Functions
- [x] Implement balance checking (ETH)
- [x] Implement ERC20 balance checking
- [x] Implement address retrieval (smart account address)

### 5.6 Skill API Endpoints
- [x] `POST /api/skills/evm-wallet/transfer` - Execute transfer
- [x] `POST /api/skills/evm-wallet/send-transaction` - Execute tx
- [x] `GET /api/skills/evm-wallet/balance` - Get balance
- [x] `GET /api/skills/evm-wallet/address` - Get wallet address

---

## Phase 6: Human Approval System

### 6.1 Telegram Bot Setup
- [x] Create Telegram bot via BotFather
- [x] Set up Telegram bot SDK (grammy)
- [x] Implement bot startup and connection handling (long polling)
- [x] Store bot webhook/polling configuration

### 6.2 User Linking
- [x] Implement `/start` command with linking code
- [x] Generate unique linking codes for users (POST /api/user/telegram/link)
- [x] Verify Telegram username matches registered user
- [x] Store Telegram chat ID for user

### 6.3 Approval Flow
- [x] Create pending approval record in database
- [x] Send approval request message to user
  - [x] Format transaction details nicely
  - [x] Include inline keyboard (Approve/Deny buttons)
- [x] Handle button callbacks
  - [x] Validate callback is for correct user
  - [x] Update pending approval status
  - [x] Resume transaction execution
- [x] Implement timeout handling
  - [x] Background job to expire old approvals (1-minute interval checker)
  - [x] Notify agent of timeout

### 6.4 Approval Notifications
- [x] Send confirmation when action is approved
- [x] Send notification when action is denied
- [x] Send notification for automatic approvals (timeout expiry notifications)

---

## Phase 7: Secret Management API (for Agents)

### 7.1 Agent Endpoints
- [x] `POST /api/secrets` - Create new secret
  - [x] Accept secret type (e.g., `evm_wallet`) and optional memo
  - [x] For evm_wallet: generate EOA private key, create smart account
  - [x] Generate and return API key
  - [x] Generate and return claim URL
  - [x] Return wallet address (for evm_wallet)
  - [x] Agent never receives the actual secret value
- [x] `GET /api/secrets/info` - Get secret info by API key
  - [x] Return metadata, not secret value
  - [x] For evm_wallet: return address, chain

### 7.2 Response Formatting
- [x] Standardize API response format
- [x] Include transaction hashes where applicable
- [x] Include approval status in responses
- [x] Provide clear error messages

---

## Phase 8: Billing & Subscriptions

### 8.1 Stripe Integration
- [x] Set up Stripe SDK
- [x] Create Stripe product and price for $10/month subscription
- [x] Implement Stripe customer creation (on user signup or first subscribe)
- [x] Store stripe_customer_id on User model

### 8.2 Subscription Management
- [x] Implement subscription creation via Stripe Checkout
  - [x] Create checkout session
  - [x] Redirect user to Stripe
  - [x] Handle success/cancel redirects
- [x] Implement Stripe webhook handler
  - [x] `checkout.session.completed` - activate subscription
  - [x] `invoice.paid` - confirm payment
  - [x] `invoice.payment_failed` - handle failed payment
  - [x] `customer.subscription.deleted` - deactivate subscription
  - [x] `customer.subscription.updated` - sync status and period
- [x] Implement subscription status checking
- [x] Implement subscription cancellation

### 8.3 Subscription API Endpoints
- [x] `GET /api/billing/subscription` - Get current subscription status
- [x] `POST /api/billing/subscribe` - Create Stripe checkout session
- [x] `POST /api/billing/webhook` - Stripe webhook handler
- [x] `POST /api/billing/cancel` - Cancel subscription

### 8.4 Gas Usage Billing
- [x] Implement monthly gas cost aggregation
  - [x] Aggregation function callable per-user per-month
  - [x] Sum all GasUsage records per user for the month
  - [x] Create/update MonthlyGasSummary record
- [x] Implement batch monthly aggregation for all users
- [ ] Create Stripe invoice for gas usage (deferred - requires Stripe metered billing setup)
  - [ ] Use Stripe metered billing or invoice items
  - [ ] Attach to customer's subscription
- [ ] Handle invoice payment
  - [ ] Mark MonthlyGasSummary as billed

### 8.5 Usage API Endpoints
- [x] `GET /api/billing/usage` - Get current month gas usage
- [x] `GET /api/billing/usage/history` - Get historical usage by month
- [x] `GET /api/billing/invoices` - List past invoices

---

## Phase 9: Frontend Application

### 9.1 Project Setup
- [x] Initialize React + TypeScript project (Vite or CRA)
- [x] Set up Tailwind CSS or styled-components
- [x] Configure routing (React Router)
- [x] Set up API client (axios or fetch wrapper)

### 9.2 Authentication Pages
- [x] Login page with Stytch pre-built UI SDK (`<StytchLogin>` component)
- [x] OAuth login buttons (Google via Stytch UI SDK)
- [x] Handle auth callback (Stytch SDK session detection + backend sync)
- [x] Implement logout

### 9.3 Dashboard
- [x] List all claimed secrets
- [x] Show secret type, memo, created date
- [x] Show wallet address for evm_wallet secrets
- [x] Quick actions (view, configure)

### 9.4 Secret Detail Page
- [x] Display secret metadata
- [ ] Show memo/description (editable)
- [x] For evm_wallet: show address, balance
- [ ] Audit log summary/link
- [ ] Gas usage summary
- [ ] Future: secret value input for user-provided secrets

### 9.5 Policy Management UI
- [x] List current policies
- [x] Add new policy form
  - [x] Policy type dropdown
  - [x] Dynamic config fields based on type
- [ ] Edit existing policies
- [x] Delete policies with confirmation

### 9.6 API Key Management UI
- [x] List API keys (name, created, status)
- [x] Create new API key
  - [x] Show key once on creation
  - [x] Copy to clipboard button
- [x] Revoke API key with confirmation

### 9.7 Telegram Configuration
- [x] Display current Telegram username
- [x] Edit Telegram username
- [x] Show linking instructions
- [x] Display linking status (connected/not connected)

### 9.8 Claim Flow
- [x] Claim page (accessed via claim URL)
- [ ] Show secret preview (type, memo)
- [x] Require authentication to claim
- [x] Confirmation and redirect to dashboard

### 9.9 Billing UI
- [x] Subscription status display
- [x] Subscribe button (redirect to Stripe Checkout)
- [x] Current month gas usage display
- [x] Usage history view
- [x] Invoice history view
- [x] Cancel subscription flow

---

## Phase 10: Audit Logging System

### 10.1 Audit Log Implementation
- [ ] Create audit logging service
- [ ] Log all skill executions with full details:
  - [ ] Full request input data
  - [ ] Full response output data
  - [ ] Policy check results
  - [ ] Approval status and details
  - [ ] Execution time
  - [ ] Error messages if failed
- [ ] Log admin actions:
  - [ ] Policy creates/updates/deletes
  - [ ] API key creates/revokes
  - [ ] Secret claims
  - [ ] Telegram linking
- [ ] Track metadata:
  - [ ] API key ID or user ID that triggered action
  - [ ] IP address
  - [ ] User agent
  - [ ] Timestamp
- [ ] Implement log retention policy (configurable)

### 10.2 Audit Log API
- [ ] `GET /api/secrets/:id/audit-logs` - List audit logs (admin only)
- [ ] `GET /api/secrets/:id/audit-logs/:logId` - Get single log detail
- [ ] Filter by date range
- [ ] Filter by action type
- [ ] Filter by status (success, failed, pending)
- [ ] Pagination support
- [ ] `GET /api/secrets/:id/audit-logs/export` - Export as CSV/JSON

### 10.3 Audit Log UI
- [ ] Audit log list view in secret detail page
- [ ] Expandable log entries showing full input/output
- [ ] Filter/search controls
- [ ] Export button
- [ ] Visual indicators for success/failure/pending

---

## Phase 11: Deployment & Operations

### 11.1 Heroku Setup
- [ ] Create Heroku app
- [ ] Configure PostgreSQL addon
- [ ] Set up environment variables
- [ ] Configure buildpacks (Node.js)
- [ ] Set up SSL/custom domain

### 11.2 CI/CD
- [ ] Set up GitHub Actions or Heroku pipeline
- [ ] Run tests on PR
- [ ] Auto-deploy main branch to staging
- [ ] Manual promotion to production

### 11.3 Monitoring
- [ ] Set up error tracking (Sentry)
- [ ] Configure uptime monitoring
- [ ] Set up alerts for failures
- [ ] Add metrics/logging dashboard

### 11.4 Security Hardening
- [ ] Verify PostgreSQL encryption at rest is enabled
- [ ] Penetration testing checklist
- [ ] Rate limiting tuning
- [ ] Input validation review
- [ ] Audit log review for completeness

---

## Phase 12: Documentation & Polish

### 12.1 API Documentation
- [ ] OpenAPI/Swagger spec
- [ ] API reference documentation
- [ ] Authentication guide

### 12.2 Integration Guides
- [ ] Agent integration guide (how to use as an AI agent)
- [ ] Policy configuration guide
- [ ] Telegram setup guide
- [ ] Billing and subscription guide

### 12.3 Code Quality
- [ ] Add comprehensive tests (unit + integration)
- [ ] Code review and refactoring
- [ ] Performance optimization

---

## Milestones

### MVP (Minimum Viable Product)
Phases 1-8 complete:
- Agent can create a wallet and get API key (we generate the secret)
- Agent can execute transfers and transactions (testnets free, mainnets require subscription)
- Gas abstraction via ZeroDev paymaster
- Basic policies work (allowlists, spending limits)
- Telegram approvals functional
- Stripe subscription for mainnet access ($10/month)
- User can claim and configure secrets via API/basic UI

### Beta
Phases 9-11 complete:
- Full frontend application with billing UI
- Comprehensive audit logs viewable by admin
- Gas usage tracking and monthly invoicing
- Deployed to Heroku
- Basic monitoring

### 1.0 Release
Phase 12 complete:
- Full documentation
- Comprehensive tests
- Security audit passed

---

## Dependencies & External Services

| Service | Purpose | Account Needed |
|---------|---------|----------------|
| Stytch | Authentication | Yes (free tier available) |
| ZeroDev | Smart accounts + gas sponsorship | Yes (free tier available) |
| Stripe | Subscriptions + billing | Yes |
| Telegram | Approval bot | Bot created via BotFather |
| Heroku | Hosting | Yes |
| PostgreSQL | Database | Via Heroku addon |
| CoinGecko | Price data | Optional API key for higher limits |

---

## Risk Areas & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Database breach | Secrets exposed | PostgreSQL encryption at rest, network isolation, audit logs |
| ZeroDev API changes | Skill breaks | Pin SDK version, monitor updates |
| Price oracle failure | Spending limits fail | Fallback to deny, cached prices |
| Telegram bot downtime | Approvals blocked | Timeout + retry, future: alt channels |
| Database loss | All data lost | Regular backups, replication |
| Unauthorized access | Secrets misused | Comprehensive audit logging, API key revocation |
| Stripe webhook failure | Billing out of sync | Idempotent handlers, webhook retry, manual reconciliation |
| Gas cost spikes | Unexpected bills for users | Usage alerts, spending caps, clear pricing display |
