import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import CopyButton from './CopyButton';
import { env } from '../env';

type SkillId = 'wallet' | 'polymarket' | 'brave-search' | 'twitter';

interface ConnectAgentsProps {
  compact?: boolean;
  className?: string;
}

const SKILLS: Array<{
  id: SkillId;
  label: string;
  description: string;
  examples: string[];
}> = [
  {
    id: 'wallet',
    label: 'Agent Wallet',
    description: 'Transfers, swaps, and on-chain execution on any EVM chain.',
    examples: [
      'Create a wallet for my user and send me the claim link.',
      'Show the wallet address and current balances.',
      'Transfer 0.01 ETH to 0x...',
    ],
  },
  {
    id: 'polymarket',
    label: 'Polymarket',
    description: 'Browse markets, place bets, and manage positions.',
    examples: [
      'Find active markets about the 2026 election.',
      'Place a $25 bet on YES for the top market.',
      'Show my current positions and P&L.',
    ],
  },
  {
    id: 'brave-search',
    label: 'Brave Search',
    description: 'Web and news search with pay-per-call billing.',
    examples: [
      'Search the web for the latest on ETH ETF inflows.',
      "Find recent news about Polygon's latest upgrade.",
    ],
  },
  {
    id: 'twitter',
    label: 'Twitter / X',
    description: 'Search tweets, profiles, and recent activity.',
    examples: [
      'Find recent tweets about Solana memecoins.',
      'Get the latest tweets from @vitalikbuterin.',
    ],
  },
];

function resolveMcpUrl(): string {
  const apiUrl = env.API_URL;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const base = apiUrl.startsWith('http') ? apiUrl : `${origin}${apiUrl}`;
  const normalized = base.endsWith('/') ? base.slice(0, -1) : base;
  const trimmed = normalized.endsWith('/api') ? normalized.slice(0, -4) : normalized;
  return `${trimmed}/mcp`;
}

function CommandBox({ value }: { value: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
      <code className="font-mono text-xs text-foreground break-all">{value}</code>
      <CopyButton text={value} />
    </div>
  );
}

export default function ConnectAgents({ compact, className }: ConnectAgentsProps) {
  const [openId, setOpenId] = useState<string>('openclaw');
  const [selectedSkill, setSelectedSkill] = useState<SkillId>('wallet');
  const mcpUrl = useMemo(() => resolveMcpUrl(), []);
  const apiKeyEnv = 'VINCENT_MCP_API_KEY';
  const skillUrl = `https://raw.githubusercontent.com/HeyVincent-ai/agent-skills/main/${selectedSkill}/SKILL.md`;
  const selectedSkillMeta = SKILLS.find((skill) => skill.id === selectedSkill)!;

  const clients = [
    {
      id: 'openclaw',
      name: 'OpenClaw',
      steps: [
        {
          title: 'Install skill',
          body: 'Tell your OpenClaw to install the following skill URL:',
          command: skillUrl,
        },
        {
          title: 'Reload skills',
          body: 'Restart your agent or run your reload command to pick up the new skill.',
        },
        {
          title: 'Try it out',
          body: 'Example prompts to get started:',
          prompts: selectedSkillMeta.examples,
        },
      ],
    },
    {
      id: 'claude-code',
      name: 'Claude Code',
      steps: [
        {
          title: 'Add MCP server',
          body: 'Run the following command in your Claude Code project directory:',
          command: `claude mcp add --transport http vincent ${mcpUrl}`,
        },
        {
          title: 'Restart Claude Code',
          body: 'Restart Claude Code to load the MCP server.',
        },
        {
          title: 'Try it out',
          body: 'Example prompts to get started:',
          prompts: selectedSkillMeta.examples,
        },
      ],
    },
    {
      id: 'claude-web',
      name: 'Claude Web & Desktop',
      steps: [
        {
          title: 'Add custom connector',
          body: 'Go to Settings \u2192 Connectors and click Add custom connector.',
        },
        {
          title: 'Configure connector',
          body: 'Name it Vincent and copy the MCP server URL:',
          command: mcpUrl,
        },
        {
          title: 'Add authorization',
          body: `Set the Authorization header to "Bearer ssk_..." using your Vincent API key.`,
        },
        {
          title: 'Try it out',
          body: 'Example prompts to get started:',
          prompts: selectedSkillMeta.examples,
        },
      ],
    },
    {
      id: 'chatgpt',
      name: 'ChatGPT',
      steps: [
        {
          title: 'Enable Developer Mode',
          body: 'In ChatGPT, go to Settings \u2192 Apps \u2192 Advanced Settings and enable Developer Mode.',
        },
        {
          title: 'Add MCP Server',
          body: 'Create a new MCP server using the URL below:',
          command: mcpUrl,
        },
        {
          title: 'Set authorization',
          body: 'Use a Bearer token header with your Vincent API key (ssk_...).',
        },
        {
          title: 'Try it out',
          body: 'Example prompts to get started:',
          prompts: selectedSkillMeta.examples,
        },
      ],
    },
    {
      id: 'codex',
      name: 'Codex',
      steps: [
        {
          title: 'Save your Vincent key',
          body: 'Export it so Codex can use it:',
          command: `export ${apiKeyEnv}="ssk_..."`,
        },
        {
          title: 'Add MCP server',
          body: 'Run the following command in your Codex project directory:',
          command: `codex mcp add vincent --url "${mcpUrl}" --bearer-token "$${apiKeyEnv}"`,
        },
        {
          title: 'Restart Codex',
          body: 'Run codex again to start a new session with Vincent connected.',
        },
        {
          title: 'Try it out',
          body: 'Example prompts to get started:',
          prompts: selectedSkillMeta.examples,
        },
      ],
    },
    {
      id: 'cursor',
      name: 'Cursor',
      steps: [
        {
          title: 'Open MCP servers',
          body: 'In Cursor, open Settings \u2192 MCP Servers and click Add server.',
        },
        {
          title: 'Configure server',
          body: 'Set the server URL to:',
          command: mcpUrl,
        },
        {
          title: 'Add authorization header',
          body: 'Add a custom header: Authorization: Bearer ssk_...',
        },
        {
          title: 'Try it out',
          body: 'Example prompts to get started:',
          prompts: selectedSkillMeta.examples,
        },
      ],
    },
    {
      id: 'manus',
      name: 'Manus',
      steps: [
        {
          title: 'Open connectors',
          body: 'In Manus, go to Settings \u2192 Connectors and click Add Connector.',
        },
        {
          title: 'Configure connector',
          body: 'Set Server Name to Vincent and Transport Type to HTTP.',
        },
        {
          title: 'Set server URL',
          body: 'Copy the MCP server URL:',
          command: mcpUrl,
        },
        {
          title: 'Add authorization header',
          body: 'Set Authorization to Bearer ssk_...',
        },
        {
          title: 'Try it out',
          body: 'Example prompts to get started:',
          prompts: selectedSkillMeta.examples,
        },
      ],
    },
  ];

  return (
    <div className={className}>
      <div className="flex flex-col gap-2 mb-6">
        <h2 className={`font-semibold text-foreground ${compact ? 'text-lg' : 'text-2xl'}`}>
          Connect to your existing agent
        </h2>
        <p className="text-sm text-muted-foreground">
          Use MCP to connect Vincent skills to the runtime you already use. You will need the API
          key from the account you want to expose. Manage keys in{' '}
          <Link to="/dashboard" className="text-primary hover:underline">
            Accounts
          </Link>
          .
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-6">
        {SKILLS.map((skill) => (
          <button
            key={skill.id}
            onClick={() => setSelectedSkill(skill.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              selectedSkill === skill.id
                ? 'bg-primary/10 border-primary/40 text-primary'
                : 'border-border text-muted-foreground hover:text-foreground hover:border-primary/30'
            }`}
          >
            {skill.label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {clients.map((client) => {
          const open = openId === client.id;
          return (
            <div key={client.id} className="rounded-xl border border-border bg-card">
              <button
                onClick={() => setOpenId(open ? '' : client.id)}
                className="w-full flex items-center justify-between px-4 py-3 text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center text-xs font-semibold text-foreground">
                    {client.name.slice(0, 2)}
                  </div>
                  <span className="font-medium text-foreground">{client.name}</span>
                </div>
                <ChevronDown
                  className={`w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
                />
              </button>
              {open && (
                <div className="px-4 pb-4 border-t border-border">
                  <ol className="mt-4 space-y-4">
                    {client.steps.map((step, index) => (
                      <li key={step.title} className="flex gap-3">
                        <div className="w-6 h-6 rounded-md bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center">
                          {index + 1}
                        </div>
                        <div className="flex-1 space-y-2">
                          <p className="text-sm font-semibold text-foreground">{step.title}</p>
                          <p className="text-sm text-muted-foreground">{step.body}</p>
                          {step.command && <CommandBox value={step.command} />}
                          {step.prompts && (
                            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                              {step.prompts.map((prompt) => (
                                <li key={prompt}>&ldquo;{prompt}&rdquo;</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
