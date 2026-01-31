# SafeSkills - Implementation Tasks

## Phase 1: Project Setup & Infrastructure

### 1.1 Project Initialization
- [ ] Initialize Node.js/TypeScript project with proper tsconfig
- [ ] Set up ESLint and Prettier
- [ ] Create folder structure:
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
- [ ] Set up environment variable management (.env, validation)
- [ ] Create Dockerfile for local development
- [ ] Set up docker-compose with PostgreSQL

### 1.2 Database Setup
- [ ] Install and configure Prisma
- [ ] Create initial Prisma schema:
  - [ ] User model (include stripe_customer_id)
  - [ ] Secret model
  - [ ] WalletSecretMetadata model
  - [ ] ApiKey model
  - [ ] Policy model
  - [ ] AuditLog model (comprehensive logging with inputs/outputs)
  - [ ] PendingApproval model
  - [ ] Subscription model (Stripe subscription tracking)
  - [ ] GasUsage model (per-transaction gas costs)
  - [ ] MonthlyGasSummary model (aggregated monthly billing)
- [ ] Create initial migration
- [ ] Set up database seeding for development

### 1.3 Core Backend Infrastructure
- [ ] Set up Express server with TypeScript
- [ ] Configure middleware (cors, body-parser, helmet, rate-limiting)
- [ ] Set up error handling middleware
- [ ] Create base API response helpers
- [ ] Set up request logging (structured JSON logs)
- [ ] Configure health check endpoint

---

## Phase 2: Secret Storage Foundation

### 2.1 Secret CRUD Operations
- [ ] Implement secret creation service
  - [ ] Generate unique ID
  - [ ] For generated secrets (wallets): create and store the secret value
  - [ ] For future user-provided secrets: create placeholder with null value
  - [ ] Generate claim token
  - [ ] Store in database (PostgreSQL encrypted at rest)
- [ ] Implement secret retrieval (metadata only, never raw value to agents)
- [ ] Implement secret claiming
  - [ ] Validate claim token
  - [ ] Associate with user
  - [ ] Mark as claimed
  - [ ] Invalidate claim token
- [ ] Implement secret value setting (for future user-provided secrets)
  - [ ] Only allow if secret value is null
  - [ ] Only allow for claimed secrets
- [ ] Implement secret deletion (soft delete with audit trail)

### 2.2 API Key Management
- [ ] Implement API key generation
  - [ ] Generate secure random key
  - [ ] Hash key with bcrypt
  - [ ] Store hash, return plain key once
- [ ] Implement API key validation middleware
- [ ] Implement API key listing (show name, created, revoked status)
- [ ] Implement API key revocation
- [ ] Add API key usage tracking

---

## Phase 3: Authentication & User Management

### 3.1 Stytch Integration
- [ ] Set up Stytch SDK
- [ ] Implement authentication endpoints:
  - [ ] Magic link flow (email)
  - [ ] OAuth (Google, optional)
- [ ] Handle Stytch callbacks
- [ ] Create/retrieve user on successful auth
- [ ] Generate session tokens

### 3.2 User API Endpoints
- [ ] `GET /api/user/profile` - Get current user
- [ ] `PUT /api/user/telegram` - Update Telegram username
- [ ] `GET /api/user/secrets` - List user's claimed secrets

### 3.3 Authorization Middleware
- [ ] Create session validation middleware
- [ ] Create secret ownership validation
- [ ] Create API key authentication for agent endpoints

---

## Phase 4: Policy System

### 4.1 Policy Engine Core
- [ ] Design policy configuration schema (JSON structure)
- [ ] Implement policy storage/retrieval
- [ ] Create policy validator (validate config structure)
- [ ] Build policy checker interface

### 4.2 EVM Wallet Policies
- [ ] Implement `address_allowlist` policy checker
- [ ] Implement `function_allowlist` policy checker
- [ ] Implement `token_allowlist` policy checker
- [ ] Implement `spending_limit_per_tx` policy checker
- [ ] Implement `spending_limit_daily` policy checker
  - [ ] Track spending over rolling 24h window
- [ ] Implement `spending_limit_weekly` policy checker
  - [ ] Track spending over rolling 7-day window
- [ ] Implement `require_approval` policy checker
- [ ] Implement `approval_threshold` policy checker

### 4.3 USD Price Conversion
- [ ] Integrate price oracle (CoinGecko or similar)
- [ ] Implement ETH → USD conversion
- [ ] Implement ERC20 → USD conversion
- [ ] Add caching for price data (refresh every few minutes)
- [ ] Handle missing/stale prices gracefully

### 4.4 Policy API Endpoints
- [ ] `GET /api/secrets/:id/policies` - List policies
- [ ] `POST /api/secrets/:id/policies` - Create policy
- [ ] `PUT /api/secrets/:id/policies/:policyId` - Update policy
- [ ] `DELETE /api/secrets/:id/policies/:policyId` - Delete policy

---

## Phase 5: EVM Wallet Skill

### 5.1 ZeroDev Integration
- [ ] Set up ZeroDev SDK
- [ ] Implement smart account creation from EOA
- [ ] Store smart account address in WalletSecretMetadata
- [ ] Implement transaction signing with EOA
- [ ] Handle multiple chains (start with one, design for many)
- [ ] Configure ZeroDev paymaster for gas sponsorship
  - [ ] Set up testnet paymaster (always sponsor)
  - [ ] Set up mainnet paymaster (sponsor if user has subscription)

### 5.2 Gas Tracking
- [ ] Record gas usage for each transaction
  - [ ] Capture gas used, gas price
  - [ ] Convert to USD cost
  - [ ] Store in GasUsage table
- [ ] Implement gas usage queries
  - [ ] Get usage for current billing period
  - [ ] Get usage by secret/wallet
- [ ] Check subscription before mainnet transactions
  - [ ] If no active subscription, return error with subscribe link

### 5.3 Transfer Function
- [ ] Implement ETH transfer
  - [ ] Validate to address
  - [ ] Build transfer transaction
  - [ ] Check policies
  - [ ] Execute or request approval
  - [ ] Log transaction
- [ ] Implement ERC20 transfer
  - [ ] Fetch token decimals
  - [ ] Build transfer call data
  - [ ] Check policies (including token allowlist)
  - [ ] Execute or request approval
  - [ ] Log transaction

### 5.4 Send Transaction Function
- [ ] Implement generic transaction sending
  - [ ] Parse to, data, value
  - [ ] Extract function selector from data
  - [ ] Check policies (address, function allowlists)
  - [ ] Execute or request approval
  - [ ] Log transaction

### 5.5 Read-Only Functions
- [ ] Implement balance checking (ETH)
- [ ] Implement ERC20 balance checking
- [ ] Implement address retrieval (smart account address)

### 5.6 Skill API Endpoints
- [ ] `POST /api/skills/evm-wallet/transfer` - Execute transfer
- [ ] `POST /api/skills/evm-wallet/send-transaction` - Execute tx
- [ ] `GET /api/skills/evm-wallet/balance` - Get balance
- [ ] `GET /api/skills/evm-wallet/address` - Get wallet address

---

## Phase 6: Human Approval System

### 6.1 Telegram Bot Setup
- [ ] Create Telegram bot via BotFather
- [ ] Set up Telegram bot SDK (node-telegram-bot-api or grammy)
- [ ] Implement bot startup and connection handling
- [ ] Store bot webhook/polling configuration

### 6.2 User Linking
- [ ] Implement `/start` command with linking code
- [ ] Generate unique linking codes for users
- [ ] Verify Telegram username matches registered user
- [ ] Store Telegram chat ID for user

### 6.3 Approval Flow
- [ ] Create pending approval record in database
- [ ] Send approval request message to user
  - [ ] Format transaction details nicely
  - [ ] Include inline keyboard (Approve/Deny buttons)
- [ ] Handle button callbacks
  - [ ] Validate callback is for correct user
  - [ ] Update pending approval status
  - [ ] Resume transaction execution
- [ ] Implement timeout handling
  - [ ] Background job to expire old approvals
  - [ ] Notify agent of timeout

### 6.4 Approval Notifications
- [ ] Send confirmation when action is approved
- [ ] Send notification when action is denied
- [ ] Send notification for automatic approvals (optional, configurable)

---

## Phase 7: Secret Management API (for Agents)

### 7.1 Agent Endpoints
- [ ] `POST /api/secrets` - Create new secret
  - [ ] Accept secret type (e.g., `evm_wallet`) and optional memo
  - [ ] For evm_wallet: generate EOA private key, create smart account
  - [ ] Generate and return API key
  - [ ] Generate and return claim URL
  - [ ] Return wallet address (for evm_wallet)
  - [ ] Agent never receives the actual secret value
- [ ] `GET /api/secrets/info` - Get secret info by API key
  - [ ] Return metadata, not secret value
  - [ ] For evm_wallet: return address, chain

### 7.2 Response Formatting
- [ ] Standardize API response format
- [ ] Include transaction hashes where applicable
- [ ] Include approval status in responses
- [ ] Provide clear error messages

---

## Phase 8: Billing & Subscriptions

### 8.1 Stripe Integration
- [ ] Set up Stripe SDK
- [ ] Create Stripe product and price for $10/month subscription
- [ ] Implement Stripe customer creation (on user signup or first subscribe)
- [ ] Store stripe_customer_id on User model

### 8.2 Subscription Management
- [ ] Implement subscription creation via Stripe Checkout
  - [ ] Create checkout session
  - [ ] Redirect user to Stripe
  - [ ] Handle success/cancel redirects
- [ ] Implement Stripe webhook handler
  - [ ] `checkout.session.completed` - activate subscription
  - [ ] `invoice.paid` - confirm payment
  - [ ] `invoice.payment_failed` - handle failed payment
  - [ ] `customer.subscription.deleted` - deactivate subscription
- [ ] Implement subscription status checking
- [ ] Implement subscription cancellation

### 8.3 Subscription API Endpoints
- [ ] `GET /api/billing/subscription` - Get current subscription status
- [ ] `POST /api/billing/subscribe` - Create Stripe checkout session
- [ ] `POST /api/billing/webhook` - Stripe webhook handler
- [ ] `POST /api/billing/cancel` - Cancel subscription

### 8.4 Gas Usage Billing
- [ ] Implement monthly gas cost aggregation
  - [ ] Cron job or scheduled task at end of month
  - [ ] Sum all GasUsage records per user for the month
  - [ ] Create MonthlyGasSummary record
- [ ] Create Stripe invoice for gas usage
  - [ ] Use Stripe metered billing or invoice items
  - [ ] Attach to customer's subscription
- [ ] Handle invoice payment
  - [ ] Mark MonthlyGasSummary as billed

### 8.5 Usage API Endpoints
- [ ] `GET /api/billing/usage` - Get current month gas usage
- [ ] `GET /api/billing/usage/history` - Get historical usage by month
- [ ] `GET /api/billing/invoices` - List past invoices from Stripe

---

## Phase 9: Frontend Application

### 9.1 Project Setup
- [ ] Initialize React + TypeScript project (Vite or CRA)
- [ ] Set up Tailwind CSS or styled-components
- [ ] Configure routing (React Router)
- [ ] Set up API client (axios or fetch wrapper)

### 9.2 Authentication Pages
- [ ] Login page with Stytch magic link
- [ ] OAuth login buttons (if applicable)
- [ ] Handle auth callback
- [ ] Implement logout

### 9.3 Dashboard
- [ ] List all claimed secrets
- [ ] Show secret type, memo, created date
- [ ] Show wallet address for evm_wallet secrets
- [ ] Quick actions (view, configure)

### 9.4 Secret Detail Page
- [ ] Display secret metadata
- [ ] Show memo/description (editable)
- [ ] For evm_wallet: show address, balance
- [ ] Audit log summary/link
- [ ] Gas usage summary
- [ ] Future: secret value input for user-provided secrets

### 9.5 Policy Management UI
- [ ] List current policies
- [ ] Add new policy form
  - [ ] Policy type dropdown
  - [ ] Dynamic config fields based on type
- [ ] Edit existing policies
- [ ] Delete policies with confirmation

### 9.6 API Key Management UI
- [ ] List API keys (name, created, status)
- [ ] Create new API key
  - [ ] Show key once on creation
  - [ ] Copy to clipboard button
- [ ] Revoke API key with confirmation

### 9.7 Telegram Configuration
- [ ] Display current Telegram username
- [ ] Edit Telegram username
- [ ] Show linking instructions
- [ ] Display linking status (connected/not connected)

### 9.8 Claim Flow
- [ ] Claim page (accessed via claim URL)
- [ ] Show secret preview (type, memo)
- [ ] Require authentication to claim
- [ ] Confirmation and redirect to dashboard

### 9.9 Billing UI
- [ ] Subscription status display
- [ ] Subscribe button (redirect to Stripe Checkout)
- [ ] Current month gas usage display
- [ ] Usage history view
- [ ] Invoice history view
- [ ] Cancel subscription flow

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
