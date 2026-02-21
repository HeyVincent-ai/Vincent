# Group Agent — Implementation Tasks

## Phase 1: Core (MVP)

### Database & Schema
- [ ] Create `GroupAgent` model in `prisma/schema.prisma` (id, adminId, walletSecretId, displayName, introMessage, directive, inputWeight, status, sessionId, telegramGroupId, telegramBotToken, reportingCadence, memoryFilePath, timestamps)
- [ ] Create `GroupAgentStatus` enum (`ACTIVE`, `PAUSED`, `DELETED`)
- [ ] Create `ReportingCadence` enum (`PER_TRANSACTION`, `HOURLY`, `ON_DEMAND`)
- [ ] Add `groupAgentId` optional field to `TransactionLog` for filtering group agent transactions
- [ ] Add relations: `GroupAgent` → `User` (admin), `GroupAgent` → `Secret` (wallet)
- [ ] Create and run Prisma migration
- [ ] Verify migration works on fresh DB and existing DB with data

### Platform Abstraction Layer
- [ ] Define `PlatformAdapter` interface: `sendMessage()`, `onMessage()`, `getMembers()`, `onJoin()`, `onLeave()`
- [ ] Define `PlatformMessage` type with sender identity metadata (user ID, display name, platform)
- [ ] Implement `TelegramAdapter` implementing `PlatformAdapter`
- [ ] Telegram bot provisioning: create bot, set webhook, join group
- [ ] Telegram message ingestion: listen to group messages, attribute sender, forward to session
- [ ] Telegram message posting: send agent replies, confirmations, intro/farewell messages
- [ ] Bot token lifecycle: store encrypted, revoke on group agent deletion

### Group Agent Service (`src/services/groupAgent.service.ts`)
- [ ] `createGroupAgent()` — validate inputs (including Telegram-safe display name), create DB record, provision Telegram bot, create OpenClaw session, post intro message
- [ ] `listGroupAgents(adminId)` — list all group agents for admin
- [ ] `getGroupAgent(id)` — get detail with status, config, and memory summary
- [ ] `updateGroupAgent(id, updates)` — update directive, input weight, display name, intro message, reporting cadence; push changes to live session
- [ ] `pauseGroupAgent(id)` — set status to PAUSED, stop responding in group (retain memory)
- [ ] `resumeGroupAgent(id)` — set status to ACTIVE, resume group listening
- [ ] `deleteGroupAgent(id)` — post farewell message, revoke bot token, delete memory file, soft-delete record
- [ ] `getMemorySummary(id)` — read memory file from filesystem, return read-only summary
- [ ] `resetMemory(id)` — destructive wipe of memory file
- [ ] `approveAction(id, actionId)` — force-approve a pending group action
- [ ] `rejectAction(id, actionId)` — force-reject a pending group action
- [ ] Enforce one group agent per Telegram group constraint
- [ ] Enforce admin must have active wallet with per-tx spending limit configured

### Memory System
- [ ] Deterministic file path derivation from session ID
- [ ] Memory file creation on group agent activation
- [ ] Memory captures: recurring themes, ideas proposed + outcomes, executed transactions, alignment patterns
- [ ] Memory persists across deactivation/reactivation
- [ ] Memory deleted only on group agent deletion
- [ ] Memory never surfaced in group chat

### OpenClaw Session Integration
- [ ] Define `group_participant` session type with `parent_session_id`, `input_weight`, `consensus_config`
- [ ] Implement `group_mode` flag on session: switches message ingestion from 1:1 to multi-party
- [ ] Multi-party message ingestion: read from all participants, post replies to shared channel
- [ ] Message attribution: each message carries sender identity metadata (Telegram user ID / display name)
- [ ] Configurable debounce/batching window (5–10s default) for fast-moving threads
- [ ] Agent context window accumulates group history in arrival order
- [ ] Agent initialized with only its own memory file — never admin's memory

### Alignment & Reasoning Engine
- [ ] Directive injection into agent system prompt as the primary reasoning anchor
- [ ] Input weight mapping to alignment sensitivity: low (passive signal) → high (active engagement)
- [ ] Alignment check: evaluate each group idea against directive before taking action
- [ ] Prompt injection resistance: detect and ignore attempts to override directive, claim admin authority, or escalate permissions
- [ ] Rate limiting on group-sourced action triggers to prevent coordinated manipulation
- [ ] Agent can ask clarifying questions or surface market data before evaluating an idea

### Pre-Execution Confirmation Flow
- [ ] Before executing any transaction, post plain-language confirmation in group: what, amount, 60-second countdown ("Proceeding in 60s unless someone objects")
- [ ] Countdown timer with cancellation on objection
- [ ] If action exceeds approval threshold → notify group it's pending admin approval (no countdown)
- [ ] Route approval request to admin via async notification
- [ ] On admin approve → execute and report back to group
- [ ] On admin reject → notify group the action was declined

### Post-Execution Reporting
- [ ] Post execution confirmations in group with tx hash / chain explorer link
- [ ] If action declined due to policy constraints, explain in plain language in group and notify admin asynchronously with the denial reason
- [ ] All skill calls route through existing Vincent server-side policy layer
- [ ] Session policies evaluated independently from admin's personal session policies
- [ ] Session policies can be tighter than admin's global policy but never looser

### Admin Async Updates
- [ ] Implement structured digest format: ideas surfaced, alignment assessments, actions taken (with tx hash), actions declined (with reason), position summary
- [ ] Deliver digests to admin's private Telegram chat (if linked) or dashboard
- [ ] Configurable cadence: per-transaction, hourly, on-demand
- [ ] Notify admin of: new alignment-checked ideas, pending approvals, executed transactions, policy denials (with reason)

### Routes (`src/api/routes/groupAgent.routes.ts`)
- [ ] `POST /api/group-agents` — create group agent (wizard completion)
- [ ] `GET /api/group-agents` — list admin's group agents
- [ ] `GET /api/group-agents/:id` — get group agent detail
- [ ] `PATCH /api/group-agents/:id` — update config (directive, weight, name, intro, cadence)
- [ ] `POST /api/group-agents/:id/pause` — pause agent
- [ ] `POST /api/group-agents/:id/resume` — resume agent
- [ ] `DELETE /api/group-agents/:id` — deactivate and delete agent
- [ ] `GET /api/group-agents/:id/memory` — read-only memory summary
- [ ] `DELETE /api/group-agents/:id/memory` — reset memory
- [ ] `POST /api/group-agents/:id/approve/:actionId` — force-approve pending action
- [ ] `POST /api/group-agents/:id/reject/:actionId` — force-reject pending action
- [ ] Zod validation schemas for all endpoints
- [ ] Audit logging for all mutations

### Route Registration
- [ ] Import and mount group agent router in `src/api/routes/index.ts`
- [ ] Export group agent service in `src/services/index.ts`

### Agent Lifecycle Messages
- [ ] Configurable intro message on group join: what the agent is, directive summary, what it can/cannot do
- [ ] Default intro generated from directive if admin leaves blank
- [ ] Farewell message on deactivation (does not expose reason or admin context)

### Frontend — Group Agent List Page (`/group-agents`)
- [ ] Card per group agent: name, Telegram group name, status badge, last activity timestamp
- [ ] Quick actions on each card: pause/resume, delete (with confirmation)
- [ ] "Create Group Agent" button (disabled with tooltip if no wallet with per-tx spending limit)
- [ ] Empty state: explanation of what group agents are, CTA to create first one

### Frontend — Creation Wizard (`/group-agents/new`)
- [ ] Step 1: Name & Identity — display name (required, max 32 chars, Telegram-safe character validation), intro message (optional), reporting cadence selector (per-transaction/hourly/on-demand)
- [ ] Step 2: Agent Directive — text area with placeholder examples, character counter, required
- [ ] Step 3: Input Weight — slider or stepped selector (Low/Medium/High or 0–100%), dynamic description
- [ ] Step 4: Policy Review — read-only wallet policy summary, link to edit policies, blocked state if no per-tx limit, acknowledgment checkbox
- [ ] Step 5: Telegram Group Linking — inline instructions, `/connect <token>` verification flow, conflict check, group name + member count confirmation
- [ ] Step 6: Review & Activate — full config summary, isolated memory note, "Activate Group Agent" CTA
- [ ] Wizard navigation: back/next, step indicator, validation per step
- [ ] On activation: create via API, redirect to dashboard with new card

### Frontend — Group Agent Detail Page (`/group-agents/:id`)
- [ ] Overview tab: status badge, editable fields (name, directive, input weight, intro message, reporting cadence), pause/resume/delete actions
- [ ] Activity tab: recent group ideas with alignment assessments, executed/declined actions, digests sent
- [ ] Memory tab: read-only rendered summary, "Reset Memory" button with destructive confirmation dialog
- [ ] Audit Logs tab: filtered TransactionLog entries for this group agent

### Frontend — Dashboard Integration
- [ ] Add "Group Agents" link to sidebar navigation
- [ ] Group agent activity section in dashboard overview (if group agents exist)

### Frontend — API Client (`api.ts`)
- [ ] `createGroupAgent(config)` function
- [ ] `listGroupAgents()` function
- [ ] `getGroupAgent(id)` function
- [ ] `updateGroupAgent(id, updates)` function
- [ ] `pauseGroupAgent(id)` function
- [ ] `resumeGroupAgent(id)` function
- [ ] `deleteGroupAgent(id)` function
- [ ] `getGroupAgentMemory(id)` function
- [ ] `resetGroupAgentMemory(id)` function
- [ ] `approveGroupAgentAction(id, actionId)` function
- [ ] `rejectGroupAgentAction(id, actionId)` function

### Testing
- [ ] Unit tests: group agent CRUD operations
- [ ] Unit tests: platform adapter interface and Telegram implementation
- [ ] Unit tests: memory file lifecycle (create, read, persist, delete)
- [ ] Unit tests: one-agent-per-group constraint enforcement
- [ ] Unit tests: policy evaluation for group agent sessions (tighter-only enforcement)
- [ ] Unit tests: debounce/batching window behavior
- [ ] E2E test: create group agent → link Telegram group → verify bot joins and posts intro
- [ ] E2E test: group message → alignment check → pre-execution confirmation → execute → post confirmation
- [ ] E2E test: policy denial → agent explains in group → admin notified
- [ ] E2E test: admin pause/resume/delete lifecycle
- [ ] E2E test: admin approve/reject pending action flow
- [ ] E2E test: memory persistence across deactivation/reactivation

### Documentation
- [ ] Update README.md with Group Agent section
- [ ] Add group agent endpoints to API docs

## Phase 2: Enhanced UX & Monitoring

### Dashboard Enhancements
- [ ] Group agent health monitoring (last message time, error rate, response latency)
- [ ] Group agent comparison view (multiple agents side-by-side performance)
- [ ] Aggregate spending across all group agents

### Memory Enhancements
- [ ] Structured memory viewer (themes, ideas, outcomes) instead of raw file
- [ ] Memory search/filter by topic or date range
- [ ] Memory export

### Reporting Enhancements
- [ ] Email digest delivery option
- [ ] Custom digest templates
- [ ] Spending alerts and budget warnings

## Phase 3: Multi-Platform & Advanced (Future)

- [ ] Discord adapter implementation
- [ ] Identity-based message weighting (reputation system)
- [ ] Multi-admin / multi-authority sessions
- [ ] Agent-to-agent group communication
- [ ] Non-financial group actions
- [ ] Save-draft state for the wizard
