import { useState } from 'react';

/**
 * Standalone preview page for new components (Strategy Manager + AgentConfig).
 * Renders with mock data — no auth or API required.
 * Access at /preview
 */

// ============================================================
// Shared constants (mirrored from StrategyManager)
// ============================================================

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-green-500/10 text-green-400 border-green-500/20',
  PAUSED: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  ARCHIVED: 'bg-muted text-muted-foreground border-border',
};

const RISK_COLORS: Record<string, string> = {
  CONSERVATIVE: 'text-blue-400',
  MODERATE: 'text-yellow-400',
  AGGRESSIVE: 'text-red-400',
};

const TRIGGER_LABELS: Record<string, string> = {
  PRICE_THRESHOLD: 'Price',
  CRON_SCHEDULE: 'Schedule',
  POLYMARKET_ODDS: 'Odds',
};

// ============================================================
// Mock: Strategy List View
// ============================================================

interface MockAlert {
  id: string;
  triggerType: string;
  triggerConfig: Record<string, unknown>;
  instruction: string;
  enabled: boolean;
  lastTriggeredAt: string | null;
}

interface MockStrategy {
  id: string;
  label: string;
  strategyType: string;
  thesisText: string;
  riskProfile: string;
  status: string;
  createdAt: string;
  alertRules: MockAlert[];
}

const MOCK_STRATEGIES: MockStrategy[] = [
  {
    id: '1',
    label: 'ETH Price Monitor',
    strategyType: 'CUSTOM',
    thesisText:
      'ETH is undervalued relative to BTC. Monitor the ratio and alert on significant divergence for potential entry points.',
    riskProfile: 'MODERATE',
    status: 'ACTIVE',
    createdAt: '2026-02-12T08:00:00Z',
    alertRules: [
      {
        id: 'a1',
        triggerType: 'PRICE_THRESHOLD',
        triggerConfig: { asset: 'ETH', direction: 'below', price: 2500 },
        instruction:
          'ETH dropped below $2,500. Analyze current market conditions, check on-chain metrics, and recommend whether this is a buying opportunity.',
        enabled: true,
        lastTriggeredAt: '2026-02-13T14:22:00Z',
      },
      {
        id: 'a2',
        triggerType: 'PRICE_THRESHOLD',
        triggerConfig: { asset: 'ETH', direction: 'above', price: 4000 },
        instruction:
          'ETH broke above $4,000. Evaluate whether momentum is sustainable and suggest partial profit-taking levels.',
        enabled: true,
        lastTriggeredAt: null,
      },
      {
        id: 'a3',
        triggerType: 'CRON_SCHEDULE',
        triggerConfig: { cron: '0 */6 * * *' },
        instruction:
          'Provide a 6-hour market summary: ETH price action, volume trends, whale movements, and any notable on-chain activity.',
        enabled: true,
        lastTriggeredAt: '2026-02-14T06:00:00Z',
      },
    ],
  },
  {
    id: '2',
    label: 'US Election Odds Tracker',
    strategyType: 'POLYMARKET',
    thesisText:
      'Track prediction market odds for US presidential election. Alert when odds shift significantly to identify early sentiment changes.',
    riskProfile: 'CONSERVATIVE',
    status: 'ACTIVE',
    createdAt: '2026-02-10T12:00:00Z',
    alertRules: [
      {
        id: 'a4',
        triggerType: 'POLYMARKET_ODDS',
        triggerConfig: { conditionId: 'abc123', outcome: 'Yes', direction: 'above', probability: 0.6 },
        instruction:
          'Odds crossed 60%. Research recent events that may have caused the shift and send a Telegram summary.',
        enabled: true,
        lastTriggeredAt: null,
      },
      {
        id: 'a5',
        triggerType: 'CRON_SCHEDULE',
        triggerConfig: { cron: '0 9 * * *' },
        instruction: 'Daily morning briefing: current odds, 24h change, and key news items affecting the market.',
        enabled: false,
        lastTriggeredAt: '2026-02-14T09:00:00Z',
      },
    ],
  },
  {
    id: '3',
    label: 'DeFi Yield Scanner',
    strategyType: 'CUSTOM',
    thesisText: 'Scan top DeFi protocols for yield opportunities above 8% APY with acceptable risk profiles.',
    riskProfile: 'AGGRESSIVE',
    status: 'PAUSED',
    createdAt: '2026-02-08T15:00:00Z',
    alertRules: [
      {
        id: 'a6',
        triggerType: 'CRON_SCHEDULE',
        triggerConfig: { cron: '*/30 * * * *' },
        instruction:
          'Scan Aave, Compound, and Curve for pools with >8% APY. Filter by TVL >$10M and audit status. Report findings.',
        enabled: true,
        lastTriggeredAt: '2026-02-14T10:30:00Z',
      },
    ],
  },
];

function formatTrigger(alert: MockAlert) {
  const cfg = alert.triggerConfig;
  if (alert.triggerType === 'CRON_SCHEDULE') return `Cron: ${cfg.cron}`;
  if (alert.triggerType === 'PRICE_THRESHOLD')
    return `${cfg.asset} ${cfg.direction} $${cfg.price}`;
  if (alert.triggerType === 'POLYMARKET_ODDS')
    return `Odds ${cfg.direction} ${((cfg.probability as number) * 100).toFixed(0)}%`;
  return alert.triggerType;
}

function StrategyListPreview() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = MOCK_STRATEGIES.find((s) => s.id === selectedId);

  if (selected) {
    return (
      <div className="bg-card rounded-lg border border-border">
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelectedId(null)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-foreground font-medium">{selected.label}</h3>
                <span className={`px-2 py-0.5 rounded text-xs font-medium border ${STATUS_COLORS[selected.status]}`}>
                  {selected.status}
                </span>
                <span className={`text-xs ${RISK_COLORS[selected.riskProfile]}`}>{selected.riskProfile}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {selected.strategyType} &middot; Created {new Date(selected.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                selected.status === 'ACTIVE'
                  ? 'border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10'
                  : 'border-green-500/30 text-green-400 hover:bg-green-500/10'
              }`}
            >
              {selected.status === 'ACTIVE' ? 'Pause' : 'Activate'}
            </button>
            <button className="text-xs border border-destructive/30 text-destructive px-3 py-1.5 rounded hover:bg-destructive/10 transition-colors">
              Delete
            </button>
          </div>
        </div>

        {/* Thesis */}
        <div className="p-4 border-b border-border">
          <h4 className="text-xs font-medium text-muted-foreground mb-1">Thesis</h4>
          <p className="text-sm text-foreground">{selected.thesisText}</p>
        </div>

        {/* Alert Rules */}
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-medium text-muted-foreground">Alert Rules ({selected.alertRules.length})</h4>
            <button className="text-xs text-primary hover:text-primary/80 transition-colors">+ Add rule</button>
          </div>
          <div className="space-y-2">
            {selected.alertRules.map((alert) => (
              <div
                key={alert.id}
                className={`rounded-lg border p-3 ${
                  alert.enabled ? 'border-border bg-background' : 'border-border/50 bg-muted/30 opacity-60'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                        {TRIGGER_LABELS[alert.triggerType] || alert.triggerType}
                      </span>
                      <span className="text-xs text-muted-foreground">{formatTrigger(alert)}</span>
                      {alert.lastTriggeredAt && (
                        <span className="text-xs text-muted-foreground">
                          Last: {new Date(alert.lastTriggeredAt).toLocaleString()}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-foreground/80 break-words">{alert.instruction}</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      className={`w-8 h-5 rounded-full transition-colors relative ${
                        alert.enabled ? 'bg-green-500' : 'bg-muted'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                          alert.enabled ? 'left-3.5' : 'left-0.5'
                        }`}
                      />
                    </button>
                    <button className="text-muted-foreground hover:text-foreground p-1 transition-colors" title="Edit">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                        />
                      </svg>
                    </button>
                    <button
                      className="text-muted-foreground hover:text-destructive p-1 transition-colors"
                      title="Delete"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // List view
  return (
    <div className="bg-card rounded-lg border border-border">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h3 className="text-foreground font-medium">Strategies</h3>
        <button className="text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded hover:bg-primary/90 transition-colors">
          + New Strategy
        </button>
      </div>
      <div className="divide-y divide-border">
        {MOCK_STRATEGIES.map((strategy) => (
          <div
            key={strategy.id}
            className="p-4 hover:bg-muted/30 transition-colors cursor-pointer"
            onClick={() => setSelectedId(strategy.id)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">{strategy.label}</span>
                <span className={`px-1.5 py-0.5 rounded text-xs border ${STATUS_COLORS[strategy.status]}`}>
                  {strategy.status}
                </span>
                <span className={`text-xs ${RISK_COLORS[strategy.riskProfile]}`}>{strategy.riskProfile}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">{strategy.alertRules.length} alerts</span>
                <button
                  className={`w-8 h-5 rounded-full transition-colors relative ${
                    strategy.status === 'ACTIVE' ? 'bg-green-500' : 'bg-muted'
                  }`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <span
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                      strategy.status === 'ACTIVE' ? 'left-3.5' : 'left-0.5'
                    }`}
                  />
                </button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{strategy.thesisText}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// Mock: Update Status Section
// ============================================================

function UpdateStatusSection() {
  const [expanded, setExpanded] = useState(false);

  const logs = [
    { version: 1, name: 'add-memory-files', status: 'SUCCESS', appliedAt: '2026-02-14T10:30:00Z' },
    { version: 2, name: 'add-agent-scripts', status: 'SUCCESS', appliedAt: '2026-02-14T10:31:00Z' },
  ];

  return (
    <div className="bg-card rounded-lg border border-border p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-foreground">Config Updates</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs px-2 py-0.5 rounded bg-status-success-muted text-status-success">
            v2 — up to date
          </span>
        </div>
      </div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {expanded ? 'Hide' : 'Show'} update history ({logs.length})
      </button>
      {expanded && (
        <div className="mt-2 space-y-1">
          {logs.map((log) => (
            <div key={log.version} className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              <span>
                v{log.version} {log.name}
              </span>
              <span className="text-text-dim">{new Date(log.appliedAt).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Mock: Update Status (with pending)
// ============================================================

function UpdateStatusPending() {
  return (
    <div className="bg-card rounded-lg border border-border p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-foreground">Config Updates</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs px-2 py-0.5 rounded bg-status-warning-muted text-status-warning">2 pending</span>
          <button className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded hover:bg-primary/90 transition-colors">
            Apply Now
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Mock: Personality Section
// ============================================================

function PersonalitySection() {
  const [expanded, setExpanded] = useState(true);
  const [content, setContent] = useState(
    `# DeFi Research Analyst\n\nYou are a crypto research analyst focused on DeFi opportunities.\n\n## Rules\n- Always verify data before acting\n- Be concise in responses\n- Focus on risk-adjusted returns\n- Never invest more than 5% of portfolio in a single position`
  );

  return (
    <div className="bg-card rounded-lg border border-border p-4">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-sm font-medium text-foreground">Agent Personality</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure your agent's personality and behavioral guidelines via SOUL.md
          </p>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? 'Collapse' : 'Edit'}
        </button>
      </div>
      {expanded && (
        <div className="mt-3">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full bg-background border border-border rounded px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary resize-y min-h-[120px]"
            rows={8}
          />
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-muted-foreground">{content.length} characters (unsaved changes)</span>
            <button className="text-xs bg-primary text-primary-foreground px-3 py-1 rounded hover:bg-primary/90 transition-colors">
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Mock: Agent Maintenance Section
// ============================================================

function ScheduledTasksSection() {
  const [tasks, setTasks] = useState({
    'self-review': { enabled: true, label: 'Self-review every 4 hours' },
    'daily-recap': { enabled: false, label: 'Daily recap at 11:55pm' },
  });

  const toggle = (name: string) => {
    setTasks((prev) => ({
      ...prev,
      [name]: { ...prev[name as keyof typeof prev], enabled: !prev[name as keyof typeof prev].enabled },
    }));
  };

  return (
    <div className="bg-card rounded-lg border border-border p-4">
      <div className="mb-2">
        <h3 className="text-sm font-medium text-foreground">Agent Maintenance</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Opt-in background routines. These use LLM credits when enabled.
        </p>
      </div>
      <div className="space-y-2">
        {Object.entries(tasks).map(([name, info]) => (
          <div key={name} className="flex items-center justify-between py-1">
            <div>
              <span className="text-sm text-foreground">{info.label}</span>
              <span className="text-xs text-muted-foreground ml-2">({name})</span>
            </div>
            <button
              onClick={() => toggle(name)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                info.enabled ? 'bg-primary' : 'bg-muted'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                  info.enabled ? 'translate-x-4.5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// Mock: Memory Viewer Section
// ============================================================

function MemoryViewerSection() {
  const [expanded, setExpanded] = useState(true);
  const [selectedFile, setSelectedFile] = useState<string | null>('active-tasks.md');

  const files = ['active-tasks.md', 'lessons.md', 'self-review.md', 'projects.md', '2026-02-14.md'];

  const fileContents: Record<string, string> = {
    'active-tasks.md': `# Active Tasks

_This file is read on startup for crash recovery._

## In Progress
- Monitoring BTC/ETH ratio for divergence signal
- Scanning Aave v3 liquidation opportunities on Arbitrum

## Queued
- Research new Polymarket prediction markets
- Review portfolio rebalancing strategy

## Completed Recently
- Set up DeFi yield farming alerts
- Configured Telegram notifications`,

    'lessons.md': `# Lessons Learned

## General
- Always check gas prices before submitting large transactions
- Polymarket API rate limits at 10 req/s — use caching
- When analyzing on-chain data, verify block confirmations before acting

## Mistakes
- 2026-02-12: Sent alert for stale price data. Added staleness check.
- 2026-02-10: Missed arbitrage window due to slow RPC. Switched to Alchemy.`,

    'self-review.md': `# Self-Review Log

## 2026-02-14 10:30 UTC
- Task completion rate: 4/6 (67%)
- Stuck task: Portfolio rebalancing analysis (blocked on missing price feed)
- Efficiency: Could batch API calls to reduce latency
- Pattern to change: Stop checking prices every 30s, use 2min interval

## 2026-02-13 14:00 UTC
- All tasks on track
- Discovered new DeFi protocol worth monitoring
- Added to projects.md`,

    'projects.md': `# Project Registry

## Active
- DeFi Yield Monitor — Track top 20 yield farms across chains
- Liquidation Scanner — Monitor Aave/Compound for profitable liquidations
- Market Sentiment — Aggregate CT sentiment for trend signals

## Completed
- Telegram Alert System — Set up and verified
- Initial Portfolio Analysis — Baseline established`,

    '2026-02-14.md': `# Daily Log — 2026-02-14

## Activity
- 08:00 Resumed monitoring from active-tasks.md
- 08:15 Detected BTC/ETH ratio shift — sent analysis to user
- 09:30 Scanned 142 Aave positions, found 3 near liquidation
- 10:00 Self-review completed, updated lessons.md
- 10:30 Config updates v1+v2 applied successfully

## Issues
- CoinGecko API returned 429 twice, backed off and retried

## Priorities
- Continue liquidation monitoring
- Start Polymarket research task`,
  };

  return (
    <div className="bg-card rounded-lg border border-border p-4">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-sm font-medium text-foreground">Agent Memory</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            View your agent's memory files (tasks, lessons, self-reviews)
          </p>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? 'Collapse' : `View (${files.length} files)`}
        </button>
      </div>
      {expanded && (
        <div className="mt-3 space-y-2">
          {files.map((filename) => (
            <div key={filename}>
              <button
                onClick={() => setSelectedFile(selectedFile === filename ? null : filename)}
                className={`w-full text-left text-xs px-2 py-1.5 rounded transition-colors ${
                  selectedFile === filename
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                <span className="font-mono">{filename}</span>
              </button>
              {selectedFile === filename && (
                <div className="mt-1 ml-2">
                  <pre className="text-xs bg-background border border-border rounded p-3 overflow-auto max-h-[300px] whitespace-pre-wrap font-mono text-foreground">
                    {fileContents[filename] || '(empty)'}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Main Preview Page
// ============================================================

export default function Preview() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto p-6 space-y-8">
        <div>
          <h1 className="text-xl font-semibold text-foreground">PR #36 Preview</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Strategy alerting + scheduled agent tasks
          </p>
        </div>

        {/* Strategy Manager */}
        <section>
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Strategy Manager
          </h2>
          <StrategyListPreview />
        </section>

        <hr className="border-border" />

        {/* Agent Maintenance */}
        <section>
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Agent Maintenance
          </h2>
          <ScheduledTasksSection />
        </section>
      </div>
    </div>
  );
}
