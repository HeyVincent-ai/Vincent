import { Link } from 'react-router-dom';
import { Globe, Wallet, Rocket, Shield, Sparkles, ArrowRight } from 'lucide-react';
import ConnectAgents from './ConnectAgents';

interface WelcomeOnboardingProps {
  onDeploy: () => void;
  deploying: boolean;
  error: string | null;
  onCreateSecret: () => void;
}

const DATA_SOURCES = [
  {
    name: 'X / Twitter',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  {
    name: 'Internet & News',
    icon: <Globe className="w-5 h-5" />,
  },
];

const VENUES = [
  {
    name: 'Polymarket',
    detail: 'Prediction markets',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v18h18" />
        <path d="M7 15l3-3 3 2 5-6" />
      </svg>
    ),
  },
  {
    name: 'DeFi',
    detail: 'Swaps, lending, yield',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M8 12h8M12 8v8" />
      </svg>
    ),
  },
  {
    name: 'Crypto',
    detail: 'Self-custodial smart accounts',
    icon: <Wallet className="w-5 h-5" />,
  },
];

const STEPS = [
  {
    number: '01',
    title: 'Deploy your agent',
    desc: 'Launch a hosted AI agent in one click with built-in secret vault.',
    icon: <Rocket className="w-5 h-5" />,
  },
  {
    number: '02',
    title: 'Add secrets & policies',
    desc: 'Store API keys and credentials. Set spending limits and approval flows.',
    icon: <Shield className="w-5 h-5" />,
  },
  {
    number: '03',
    title: 'Let it learn & act',
    desc: 'Your agent executes tasks, learns from outcomes, and self-improves.',
    icon: <Sparkles className="w-5 h-5" />,
  },
];

export default function WelcomeOnboarding({ onDeploy, deploying, error, onCreateSecret }: WelcomeOnboardingProps) {
  return (
    <div className="max-w-2xl mx-auto py-8 md:py-16">
      {/* Hero */}
      <div className="text-center mb-10">
        <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-3">
          Your agent is ready to deploy
        </h1>
        <p className="text-muted-foreground text-base md:text-lg max-w-lg mx-auto">
          A self-improving AI agent with safe secret management, spending policies, and an airgapped vault — ready in one click.
        </p>
      </div>

      {/* Deploy CTA */}
      <div className="bg-card border border-border rounded-2xl p-6 md:p-8 mb-6">
        {error && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-sm text-destructive mb-4">
            {error}
          </div>
        )}

        <div className="text-center">
          <button
            onClick={onDeploy}
            disabled={deploying}
            className="bg-primary text-primary-foreground px-8 py-3.5 rounded-xl hover:bg-primary/90 transition-colors text-base font-semibold disabled:opacity-50 w-full sm:w-auto"
          >
            {deploying ? 'Redirecting to checkout...' : 'Deploy Agent For Free'}
          </button>

          <div className="flex items-center justify-center gap-3 mt-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-muted">
              7-day free trial
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-muted">
              $25 free LLM credits
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-muted">
              $25/mo after
            </span>
          </div>

          <div className="mt-4 pt-4 border-t border-border">
            <Link
              to="/skills"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Already have a bot? <span className="text-primary font-medium">Get the Skills File</span>
              <ArrowRight className="w-3.5 h-3.5 text-primary" />
            </Link>
          </div>
        </div>
      </div>

      {/* Integrations */}
      <div className="mb-10 grid md:grid-cols-2 gap-4">
        {/* Data Sources */}
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-3">Data</p>
          <div className="space-y-2.5">
            {DATA_SOURCES.map((source) => (
              <div key={source.name} className="flex items-center gap-3">
                <div className="text-muted-foreground">{source.icon}</div>
                <span className="text-sm font-medium text-foreground">{source.name}</span>
                <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-green-500/10 text-green-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                  Connected
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Venues */}
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-3">Venues</p>
          <div className="space-y-2.5">
            {VENUES.map((venue) => (
              <div key={venue.name} className="flex items-center gap-3">
                <div className="text-muted-foreground">{venue.icon}</div>
                <div>
                  <span className="text-sm font-medium text-foreground">{venue.name}</span>
                  <p className="text-[11px] text-muted-foreground leading-tight">{venue.detail}</p>
                </div>
                <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-green-500/10 text-green-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                  Connected
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Connect existing agents */}
      <div className="mb-10">
        <div className="bg-card border border-border rounded-2xl p-6 md:p-8">
          <ConnectAgents compact />
        </div>
      </div>

      {/* How It Works */}
      <div className="mb-10">
        <p className="text-xs text-muted-foreground text-center mb-4 uppercase tracking-wider font-medium">
          How it works
        </p>
        <div className="grid md:grid-cols-3 gap-4">
          {STEPS.map((step) => (
            <div key={step.number} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-primary">{step.icon}</span>
                <span className="text-xs font-bold text-muted-foreground">{step.number}</span>
              </div>
              <h3 className="text-sm font-semibold text-foreground mb-1">{step.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Secondary action */}
      <div className="text-center">
        <button
          onClick={onCreateSecret}
          className="text-sm text-muted-foreground/60 hover:text-muted-foreground transition-colors"
        >
          Or create a secret
        </button>
      </div>
    </div>
  );
}
