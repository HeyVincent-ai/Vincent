# Group Agent — Product Plan

## Overview

The Group Agent feature allows a Vincent admin to deploy an agent into a Telegram group. The group acts as a signal source: members surface ideas, ask questions, and discuss trades. The agent ingests this conversation, reasons about each idea against the admin's configured directive, and may deploy funds accordingly — all within the admin's existing Vincent wallet policies.

The admin retains full authority via a separate session. They receive asynchronous updates on what the agent learned and what transactions it executed. They can pause, adjust, or revoke the group agent at any time.

## Problem Statement

Today, Vincent agents operate in a 1:1 model — one admin, one agent, one conversation. There is no way for an agent to ingest collective signal from a group of people while maintaining the admin's authority and policy guardrails.

The alternative — having the admin manually relay group ideas to their agent — is slow, lossy, and doesn't scale. The Group Agent feature lets the admin deploy a scoped delegate into a group that autonomously processes group signal while operating strictly within the admin's configured policies.

## Core Concepts

### Dual-Session Model

OpenClaw natively distinguishes sessions. The group chat runs as a **participant session** (low-trust, collective input). The admin's dashboard or private chat runs as the **authority session** (high-trust, single principal). This distinction is enforced throughout the system and is never surfaced to group members.

### Alignment-Based Action, Not Consensus

Group input is not treated as a vote. The agent evaluates each idea raised in the group against the admin's directive and reasons about whether it aligns with what the admin would want. The **input weight** dial controls how actively the agent engages with group-sourced ideas — not how many people need to agree. A high weight means the agent is more responsive to group ideas that pass the alignment check; a low weight means it stays conservative and acts primarily on its directive.

### Scoped Skills & Policies

Each group agent instance operates within a subset of the admin's available skills and is governed by the admin's existing Vincent wallet policies. The group agent cannot operate outside those policy boundaries regardless of what group members instruct it to do.

### Isolated Memory

The group agent maintains its own memory file on the filesystem where the OpenClaw process is running. This file is entirely separate from the admin's session memory. Memory is scoped to the group session ID and persists across process restarts and deactivation/reactivation cycles.

---

## Architecture

```
┌──────────────────┐     ┌──────────────────────────────┐     ┌────────────────┐
│  Telegram Group  │────▶│  Vincent Backend              │────▶│  OpenClaw       │
│  (members post   │     │  (Group Agent Service)         │     │  (group_mode    │
│   ideas, discuss │     │                                │     │   session)      │
│   trades)        │     │  - Telegram bot integration    │     │                │
│                  │◀────│  - Message attribution         │     │  - Directive   │
│  Agent posts     │     │  - Pre-exec confirmation       │     │  - Input weight│
│  confirmations,  │     │  - Policy enforcement          │     │  - Alignment   │
│  updates, intros │     │  - Audit logging               │     │    reasoning   │
└──────────────────┘     └──────────┬───────────────────┘     └────────────────┘
                                    │
                         ┌──────────▼───────────────────┐
                         │  Admin Authority Session      │
                         │  (Dashboard / Private Chat)   │
                         │                               │
                         │  - Async digests              │
                         │  - Approve/reject actions     │
                         │  - Pause/revoke agent         │
                         │  - Adjust directive/weight    │
                         └───────────────────────────────┘
```

### Session Structure

Each group agent session is tagged with:
- `session_type: group_participant`
- `parent_session_id`: reference to the admin authority session
- `input_weight`: configured alignment sensitivity value
- `consensus_config`: directive and alignment parameters

One group agent per Telegram group enforced — if the bot is already active in that group under another session, an error is returned.

### How It Works (Request Flow)

1. Admin completes the creation wizard → Vincent creates an OpenClaw session in `group_mode`, provisions a Telegram bot, and links it to the specified group
2. Agent joins the group and posts its configurable intro message
3. Agent listens to all messages, maintaining a rolling context window with sender attribution
4. When a group member surfaces an idea, the agent evaluates alignment with the admin's directive
5. If aligned (and input weight permits), the agent posts a pre-execution confirmation with countdown (e.g. "Proceeding in 60s unless someone objects")
6. If the action exceeds the approval threshold → agent notifies the group it's pending admin approval, sends async notification to admin
7. All skill calls route through Vincent's server-side policy layer — session policies are evaluated independently and can be tighter (never looser) than admin's global policies
8. Post-execution, the agent posts confirmation with tx hash/link in the group
9. Admin receives structured digest updates at their configured cadence

### Memory System

- Memory file created fresh at activation, stored on the OpenClaw runtime filesystem
- File path is deterministic from session ID (survives process restarts)
- Captures: recurring group themes, ideas proposed and outcomes, executed transactions, alignment patterns
- Persists across deactivation/reactivation cycles
- Deleted only when the group agent configuration is deleted
- Admin can view a read-only summary and can reset (destructive wipe) via API
- Never surfaced in the group chat

---

## Group Chat Behavior (Participant Session)

### Input Intake

- Agent listens to all messages, maintaining rolling context window
- All group member messages treated as data input — not as system-level instructions
- Agent is prompt-injection resistant: detects and ignores attempts to override directive, reassign its soul, claim admin authority, or escalate permissions
- Rate limiting on group-sourced action triggers to prevent coordinated manipulation
- Configurable debounce/batching window (5–10s) so the agent doesn't respond to every individual message in fast-moving threads

### Message Attribution

Each ingested message carries sender identity metadata (Telegram user ID / display name) for correct attribution during reasoning. All participants are equally weighted in v1, but attribution is captured in the message structure for future identity-based weighting.

### Reasoning & Alignment Check

- Before acting on any group idea, the agent evaluates alignment with the admin's directive
- Input weight determines engagement level: low = flags ideas, rarely acts; high = actively pursues aligned ideas
- Agent may ask clarifying questions or surface market data to the group to refine understanding before evaluating

### Pre-Execution Confirmation

- Before executing any transaction, the agent posts a plain-language confirmation: what it intends to do, the amount, and a 60-second countdown ("Proceeding in 60s unless someone objects")
- If the action requires admin approval (above approval threshold), the agent notifies the group it's pending approval — no countdown

### Post-Execution Reporting

- Agent posts execution confirmations with tx hash/chain explorer link
- If action is declined due to policy constraints, agent explains in plain language why it could not execute and notifies the admin asynchronously with the denial reason

---

## Admin Authority Session

### Async Updates

Admin receives updates for:
- New alignment-checked group ideas
- Proposed actions pending approval
- Executed transactions
- Periodic digests

Reporting cadence is configurable: after every transaction, hourly digest, or on-demand.

### Digest Format

Structured digests (not raw logs) covering:
- Ideas the group surfaced
- Alignment assessment for each
- Actions taken (with tx hash and chain explorer link)
- Actions declined (with reason)
- Brief summary of current positions if relevant to the directive

### Controls

Admin can at any time:
- Pause the group agent
- Revoke its session
- Adjust directive / input weight
- Force-approve/reject a pending action

Admin's authority is non-bypassable — group members cannot escalate permissions or override admin-set limits regardless of prompt content.

### Audit Visibility

- Full audit visibility into every signing event, policy check, and transaction
- Key operations are transparent and attributable to the admin's session as key owner
- All group agent activity logged in Vincent dashboard under a dedicated Group Agent panel, separate from admin's direct agent activity

---

## Group Agent Creation Wizard

### Entry Point

- "Create Group Agent" button in the Vincent dashboard
- Unavailable (with tooltip) if admin has no active Vincent wallet with configured policies
- Linear multi-step flow — all steps required to activate. No save-draft in v1
- All wizard fields are editable post-creation from the group agent's detail page

### Step 1: Name & Identity

| Field | Details |
|-------|---------|
| Display name | Required. Shown in Telegram and dashboard. Max 32 characters, no special characters that break Telegram rendering. |
| Intro message | Optional. Posted on group join. Defaults to generated summary of directive. |
| Reporting cadence | How often the admin receives digests. Options: After every transaction (default), Hourly, On-demand. |

### Step 2: Agent Directive ("Soul")

| Field | Details |
|-------|---------|
| Directive | Natural language text field. Defines the agent's goal, decision-making posture, and investment philosophy. |
| Placeholder | Example prompts to guide the admin (e.g. "Deploy funds into Polymarket positions when the group surfaces a high-conviction idea that aligns with a contrarian macro view"). |
| Limit | 1000–2000 characters (TBD). Required. |
| Post-creation | Editable. Changes take effect immediately on the live session. |

### Step 3: Input Weight (Alignment Sensitivity)

| Field | Details |
|-------|---------|
| Control | Slider or stepped selector (Low / Medium / High, or 0–100%) |
| Low label | "Agent acts primarily on its own directive; uses group chat as passive signal." |
| High label | "Agent actively engages with group ideas and acts on those that align with its directive." |
| Dynamic description | Updates dynamically to explain selected level in practice. |
| Post-creation | Editable. Changes take effect immediately. |

### Step 4: Policy Review

| Field | Details |
|-------|---------|
| Display | Read-only summary of admin's existing wallet policies: address allowlist, token allowlist, spending limits, approval threshold. |
| Editing | Not editable from wizard. Link opens main policy settings in new tab. |
| Blocked state | If no per-tx spending limit is configured, wizard is blocked with warning. |
| Acknowledgment | Admin confirms these are the guardrails the group agent operates within. |

### Step 5: Telegram Group Linking

| Field | Details |
|-------|---------|
| Instructions | Inline step-by-step guide for adding the Vincent bot to the group. |
| Linking flow | Admin sends `/connect <token>` in the group → dashboard detects handshake, shows group name + member count. |
| Conflict check | Error if bot is already active in that group under another agent. |
| Post-creation | Editable — admin can re-link to a different group. |

### Step 6: Review & Activate

- Full summary of all configured values
- Note confirming isolated memory for this group session
- "Activate Group Agent" CTA → creates OpenClaw session, bot becomes active, posts intro message
- Admin returned to dashboard with new group agent card (status: Active)
- Confirmation notification sent to admin's private Telegram (if linked)

---

## API Endpoints

### `POST /api/group-agents`

Create a new group agent configuration and start the activation flow.

**Auth:** Dashboard session (admin)

**Request:**
```json
{
  "displayName": "Alpha Scanner",
  "introMessage": "Hey everyone, I'm Alpha Scanner...",
  "directive": "Deploy funds into Polymarket positions when the group surfaces a high-conviction idea...",
  "inputWeight": 70,
  "reportingCadence": "PER_TRANSACTION",
  "walletSecretId": "clxyz...",
  "telegramGroupId": "-1001234567890"
}
```

**Response:** `201`
```json
{
  "success": true,
  "data": {
    "id": "ga_abc123",
    "status": "active",
    "displayName": "Alpha Scanner",
    "sessionId": "sess_xyz",
    "telegramGroupId": "-1001234567890",
    "createdAt": "2026-02-18T12:00:00Z"
  }
}
```

### `GET /api/group-agents`

List all group agents for the authenticated admin.

### `GET /api/group-agents/:id`

Get group agent detail including status, config, and memory summary.

### `PATCH /api/group-agents/:id`

Update group agent config (directive, input weight, display name, intro message, reporting cadence). Changes take effect immediately on the live session.

### `POST /api/group-agents/:id/pause`

Pause the group agent. Agent stops responding in the group but retains memory.

### `POST /api/group-agents/:id/resume`

Resume a paused group agent.

### `DELETE /api/group-agents/:id`

Deactivate and delete the group agent. Agent posts farewell message, bot token is revoked, memory file is deleted.

### `GET /api/group-agents/:id/memory`

Read-only summary of the group agent's memory file.

### `DELETE /api/group-agents/:id/memory`

Destructive wipe of the group agent's memory file. Resets to blank.

### `POST /api/group-agents/:id/approve/:actionId`

Force-approve a pending action.

### `POST /api/group-agents/:id/reject/:actionId`

Force-reject a pending action.

---

## Database Changes

### New Prisma Models

```prisma
model GroupAgent {
  id                String   @id @default(cuid())
  adminId           String
  admin             User     @relation(fields: [adminId], references: [id])
  walletSecretId    String
  walletSecret      Secret   @relation(fields: [walletSecretId], references: [id])
  displayName       String
  introMessage      String?
  directive         String   @db.Text
  inputWeight       Int      @default(50)
  status            GroupAgentStatus @default(ACTIVE)
  sessionId         String?  @unique
  telegramGroupId   String   @unique
  telegramBotToken  String
  reportingCadence  ReportingCadence @default(PER_TRANSACTION)
  memoryFilePath    String?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  deletedAt         DateTime?
}

enum GroupAgentStatus {
  ACTIVE
  PAUSED
  DELETED
}

enum ReportingCadence {
  PER_TRANSACTION
  HOURLY
  ON_DEMAND
}
```

### Existing Model Changes

- `TransactionLog`: group agent transactions are logged with a `groupAgentId` field for filtering in the dedicated Group Agent audit panel
- `PolicyType` enum: no new types needed — group agents use existing policy types, evaluated against the session's wallet

---

## Frontend / UI

### Dashboard — Group Agent Panel

```
Authenticated pages (Layout w/ sidebar)
┌────────────────────────────────────────────────────────────┐
│  /group-agents                (list view)                   │
│   └─ Card per group agent: name, group, status, last       │
│      activity, quick actions (pause/resume/delete)          │
│                                                            │
│  /group-agents/new            (creation wizard)             │
│   └─ 6-step linear wizard                                  │
│                                                            │
│  /group-agents/:id            (detail view)                 │
│   ├─ Overview tab    (status, config summary, edit)         │
│   ├─ Activity tab    (recent actions, group ideas, digests) │
│   ├─ Memory tab      (read-only summary, reset button)     │
│   └─ Audit Logs tab  (all group agent transactions)        │
└────────────────────────────────────────────────────────────┘
```

### Creation Wizard

6-step flow matching the wizard spec:

```
Step 1: Name & Identity
┌─────────────────────────────────────────────────────────────┐
│  Display Name        [Alpha Scanner____________]            │
│                      Max 32 characters, Telegram-safe       │
│                                                             │
│  Intro Message       [Hey everyone, I'm Alpha Scanner...]   │
│  (optional)          Posted when the agent joins the group  │
│                                                             │
│  Reporting Cadence   (●) After every transaction            │
│                      ( ) Hourly digest                      │
│                      ( ) On-demand only                     │
│                                                             │
│                                        [Next →]             │
└─────────────────────────────────────────────────────────────┘

Step 2: Agent Directive
┌─────────────────────────────────────────────────────────────┐
│  What should this agent do?                                 │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Deploy funds into Polymarket positions when the group │  │
│  │ surfaces a high-conviction idea that aligns with a    │  │
│  │ contrarian macro view...                              │  │
│  └───────────────────────────────────────────────────────┘  │
│  1,247 / 2,000 characters                                   │
│                                                             │
│                                  [← Back]  [Next →]         │
└─────────────────────────────────────────────────────────────┘

Step 3: Input Weight
┌─────────────────────────────────────────────────────────────┐
│  How much should group input influence the agent?           │
│                                                             │
│  Low ──────────●────────────────── High                     │
│                    70%                                       │
│                                                             │
│  "Agent actively engages with group ideas and acts on       │
│   those that align with its directive, but exercises         │
│   moderate independent judgment."                           │
│                                                             │
│                                  [← Back]  [Next →]         │
└─────────────────────────────────────────────────────────────┘

Step 4: Policy Review
┌─────────────────────────────────────────────────────────────┐
│  Your wallet policies will govern this agent                │
│                                                             │
│  Wallet: Trading Wallet (0x1a2b...3c4d)                    │
│  ● Address Allowlist: 12 addresses                          │
│  ● Token Allowlist: USDC, ETH, WETH                        │
│  ● Spending Limit: $50/tx, $500/day                        │
│  ● Approval Threshold: >$100 requires approval              │
│                                                             │
│  [Edit policies in wallet settings →]                       │
│                                                             │
│  ☑ I understand these policies govern this group agent      │
│                                                             │
│                                  [← Back]  [Next →]         │
└─────────────────────────────────────────────────────────────┘

Step 5: Telegram Group Linking
┌─────────────────────────────────────────────────────────────┐
│  Link a Telegram group                                      │
│                                                             │
│  1. Add @VincentAgentBot to your Telegram group             │
│  2. Send this command in the group:                         │
│     /connect abc123-verification-token                      │
│  3. Wait for confirmation below                             │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  ✓ Connected: "Crypto Alpha Chat" (47 members)     │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│                                  [← Back]  [Next →]         │
└─────────────────────────────────────────────────────────────┘

Step 6: Review & Activate
┌─────────────────────────────────────────────────────────────┐
│  Review your group agent                                    │
│                                                             │
│  Name:        Alpha Scanner                                 │
│  Directive:   Deploy funds into Polymarket positions...     │
│  Input Weight: 70% (High-Medium)                            │
│  Wallet:      Trading Wallet (0x1a2b...3c4d)               │
│  Group:       Crypto Alpha Chat (47 members)                │
│  Reporting:   After every transaction                       │
│                                                             │
│  ℹ The agent will maintain its own isolated memory for      │
│    this group session, separate from your account.          │
│                                                             │
│                    [← Back]  [Activate Group Agent]          │
└─────────────────────────────────────────────────────────────┘
```

### Group Agent Detail Page

Tabs:
- **Overview**: status badge, editable config fields (name, directive, input weight, intro message, reporting cadence), pause/resume/delete actions
- **Activity**: recent group ideas with alignment assessments, executed and declined actions, digests sent to admin
- **Memory**: read-only rendered summary of the memory file, "Reset Memory" button with destructive confirmation
- **Audit Logs**: filtered view of all transactions attributed to this group agent

---

## OpenClaw Configuration Changes

### Group Mode Session Flag

- `group_mode` flag on session switches message ingestion from 1:1 to multi-party
- In group mode, agent reads messages from all participants, replies to shared channel

### Concurrent Message Handling

- Session context window accumulates group history in arrival order
- Configurable debounce/batching window (5–10s default) so agent waits for a burst of messages to settle before responding

### Agent Lifecycle Messages

- **On join**: posts configurable intro message covering what it is, its directive summary, what it can and cannot do
- **On deactivation**: posts farewell message (does not expose why or reveal admin context)

---

## Platform Abstraction

Telegram is the v1 platform, but the architecture must support future platforms (Discord, etc.) without rearchitecting the session model.

```
┌───────────────┐     ┌──────────────────┐     ┌──────────────┐
│  Telegram      │     │  Platform        │     │  Group Agent │
│  Adapter       │────▶│  Abstraction     │────▶│  Service     │
│                │     │  Layer           │     │              │
├───────────────┤     │  - sendMessage() │     │  (platform-  │
│  Discord       │────▶│  - onMessage()   │     │   agnostic)  │
│  Adapter       │     │  - getMembers()  │     │              │
│  (future)      │     │  - onJoin()      │     │              │
└───────────────┘     └──────────────────┘     └──────────────┘
```

The platform adapter layer exposes a common interface; the Group Agent service never imports Telegram-specific code directly.

---

## Security Considerations

### Prompt Injection Resistance

- Group member messages are treated as data input, never as system-level instructions
- Agent detects and ignores attempts to override directive, reassign its soul, claim admin authority, or escalate permissions
- Rate limiting on action triggers prevents coordinated manipulation

### Authority Isolation

- Admin authority session is never surfaced, mentioned, or discoverable from group chat
- Group members cannot escalate permissions or override admin-set limits
- Session policies can be tighter than admin's global policy but never looser

### Bot Token Security

- Bot token is stored encrypted in the database
- Revoked when the group agent session is deleted
- One bot per group agent (not shared across agents)

---

## Out of Scope (v1)

- Multi-admin / multi-authority sessions
- Group member reputation or identity-based weighting
- Agent-to-agent group communication
- Non-financial group actions (scoped to fund deployment only)
- Discord or other platforms (architecture supports future addition)
- Save-draft state for the wizard
