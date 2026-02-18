# Trade Manager Plan

## What It Is

Trade Manager is a local automation app that runs on OpenClaw deployments and helps users manage Polymarket positions with rule-based execution.

It lives inside the Vincent repository because Vincent is the OpenClaw deployer and provides the APIs and skills that Trade Manager depends on.

Today, Trade Manager focuses on Polymarket stop-loss and take-profit workflows. It is intentionally structured as a modular service so we can support additional markets later (for example crypto spot/perps or stocks) without changing the overall control plane model.

## Why It Exists

Manual trade monitoring is slow and error-prone, especially for fast-moving prediction markets. Trade Manager solves this by:

- syncing positions from Vincent's Polymarket skill,
- continuously evaluating user-defined rules,
- executing trades automatically when rule conditions are met, and
- recording an event log for observability and auditability.

This keeps policy enforcement and wallet management in Vincent while giving each OpenClaw VPS a local, market-aware automation worker.

## OpenClaw Deployment Context

Trade Manager is designed to run as a daemon on each OpenClaw VPS:

- **Runtime location**: local process on the user's OpenClaw deployment
- **API surface**: local HTTP API (default `localhost:19000`)
- **State**: local SQLite database (rules, monitored positions, events)
- **Execution path**: uses Vincent API endpoints and the Polymarket skill for holdings, prices, and order execution

In short: Vincent deploys and powers the system, and Trade Manager runs locally in that deployed environment to automate user trade management.

## How It Works

1. A user (through an agent) creates a rule via Trade Manager's local API.
2. Trade Manager stores the rule and starts monitoring it in the background worker.
3. The worker syncs active rules, refreshes holdings/positions from Vincent, and updates local state.
4. Pricing is sourced from Polymarket WebSocket updates when available, with Vincent API price lookups as fallback.
5. On each evaluation, Trade Manager checks trigger conditions (for example stop-loss or take-profit).
6. If a rule triggers, Trade Manager calls Vincent's Polymarket skill to place the sell order.
7. Rule status and event logs are persisted so the system is traceable and resilient across restarts.

## Core Components

- `src/api/*`: local HTTP API for health, rules, positions, events, and trade logs
- `src/worker/monitoringWorker.ts`: continuous monitoring loop + circuit breaker + WebSocket subscription management
- `src/services/ruleManager.service.ts`: rule CRUD and lifecycle transitions
- `src/services/positionMonitor.service.ts`: position sync and price retrieval
- `src/services/ruleExecutor.service.ts`: trigger evaluation and execution logic
- `src/services/vincentClient.service.ts`: client wrapper around Vincent Polymarket endpoints
- `prisma/schema.prisma`: data model for rules, monitored positions, and rule events

## Modularity and Future Expansion

The long-term direction is a pluggable market automation layer, not a Polymarket-only tool.

The current architecture already separates:

- market data ingestion,
- rule evaluation,
- execution transport (Vincent API client),
- and persistence/event logging.

That separation is the foundation for future adapters, such as:

- crypto token trading venues,
- centralized exchange connectors,
- and equities/stock broker integrations.

The objective is to keep the same OpenClaw-local control loop while swapping or adding market-specific providers behind stable rule and execution interfaces.
