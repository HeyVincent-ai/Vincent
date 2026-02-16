import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import PageShell, { CheckSvg, ChevronDown, SkillsCopyButton } from '../components/PageShell';

/* ── Icon components ─────────────────────────────────────────────── */

const XIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z" />
  </svg>
);
const GlobeIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" /><path d="M2 12h20" />
  </svg>
);
const EthIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M11.944 17.97L4.58 13.62 11.943 24l7.37-10.38-7.372 4.35h.003zM12.056 0L4.69 12.223l7.365 4.354 7.365-4.35L12.056 0z" />
  </svg>
);
const PulseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
  </svg>
);
const PolyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 42.76 53.02" fill="currentColor">
    <path fillRule="evenodd" d="M42.76,24.28V0L0,12.04v28.93l42.76,12.04v-28.74ZM38.63,23.12V5.42L7.21,14.27l31.42,8.85ZM35.55,26.51L4.14,17.66v17.69l31.42-8.85ZM7.21,38.75l31.42,8.85v-17.71l-31.42,8.85v.02Z" />
  </svg>
);
const SolIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="m23.8764 18.0313-3.962 4.1393a.9201.9201 0 0 1-.306.2106.9407.9407 0 0 1-.367.0742H.4599a.4689.4689 0 0 1-.2522-.0733.4513.4513 0 0 1-.1696-.1962.4375.4375 0 0 1-.0314-.2545.4438.4438 0 0 1 .117-.2298l3.9649-4.1393a.92.92 0 0 1 .3052-.2102.9407.9407 0 0 1 .3658-.0746H23.54a.4692.4692 0 0 1 .2523.0734.4531.4531 0 0 1 .1697.196.438.438 0 0 1 .0313.2547.4442.4442 0 0 1-.1169.2297zm-3.962-8.3355a.9202.9202 0 0 0-.306-.2106.941.941 0 0 0-.367-.0742H.4599a.4687.4687 0 0 0-.2522.0734.4513.4513 0 0 0-.1696.1961.4376.4376 0 0 0-.0314.2546.444.444 0 0 0 .117.2297l3.9649 4.1394a.9204.9204 0 0 0 .3052.2102c.1154.049.24.0744.3658.0746H23.54a.469.469 0 0 0 .2523-.0734.453.453 0 0 0 .1697-.1961.4382.4382 0 0 0 .0313-.2546.4444.4444 0 0 0-.1169-.2297zM.46 6.7225h18.7815a.9411.9411 0 0 0 .367-.0742.9202.9202 0 0 0 .306-.2106l3.962-4.1394a.4442.4442 0 0 0 .117-.2297.4378.4378 0 0 0-.0314-.2546.453.453 0 0 0-.1697-.196.469.469 0 0 0-.2523-.0734H4.7596a.941.941 0 0 0-.3658.0745.9203.9203 0 0 0-.3052.2102L.1246 5.9687a.4438.4438 0 0 0-.1169.2295.4375.4375 0 0 0 .0312.2544.4512.4512 0 0 0 .1692.196.4689.4689 0 0 0 .2518.0739z" />
  </svg>
);

const SourceIcon = ({ type }: { type: string }) => {
  switch (type) {
    case 'x': return <XIcon />;
    case 'web': return <GlobeIcon />;
    case 'eth': return <EthIcon />;
    case 'chart': return <PulseIcon />;
    case 'poly': return <PolyIcon />;
    case 'sol': return <SolIcon />;
    default: return <GlobeIcon />;
  }
};

/* ── Large hero icons ────────────────────────────────────────────── */

const SearchIcon24 = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" /><path d="M2 12h20" />
  </svg>
);
const XSearchIcon24 = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 21l-4.35-4.35" /><circle cx="11" cy="11" r="8" /><path d="M8 8l6 6M14 8l-6 6" />
  </svg>
);
const TargetIcon24 = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
  </svg>
);
const PulseIcon24 = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
  </svg>
);
const ShieldIcon24 = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);
const BoltIcon24 = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);
const TerminalIcon24 = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="4 17 10 11 4 5" /><line x1="12" x2="20" y1="19" y2="19" />
  </svg>
);

/* ── Integration logos ───────────────────────────────────────────── */

function IntegrationLogos() {
  return (
    <div className="hero__integrations anim anim-d3">
      <span className="hero__int-label">Works with</span>
      <div className="hero__int-logos">
        <span className="hero__int-logo" title="Ethereum">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M11.944 17.97L4.58 13.62 11.943 24l7.37-10.38-7.372 4.35h.003zM12.056 0L4.69 12.223l7.365 4.354 7.365-4.35L12.056 0z"/></svg>
        </span>
        <span className="hero__int-logo" title="Solana">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="m23.8764 18.0313-3.962 4.1393a.9201.9201 0 0 1-.306.2106.9407.9407 0 0 1-.367.0742H.4599a.4689.4689 0 0 1-.2522-.0733.4513.4513 0 0 1-.1696-.1962.4375.4375 0 0 1-.0314-.2545.4438.4438 0 0 1 .117-.2298l3.9649-4.1393a.92.92 0 0 1 .3052-.2102.9407.9407 0 0 1 .3658-.0746H23.54a.4692.4692 0 0 1 .2523.0734.4531.4531 0 0 1 .1697.196.438.438 0 0 1 .0313.2547.4442.4442 0 0 1-.1169.2297zm-3.962-8.3355a.9202.9202 0 0 0-.306-.2106.941.941 0 0 0-.367-.0742H.4599a.4687.4687 0 0 0-.2522.0734.4513.4513 0 0 0-.1696.1961.4376.4376 0 0 0-.0314.2546.444.444 0 0 0 .117.2297l3.9649 4.1394a.9204.9204 0 0 0 .3052.2102c.1154.049.24.0744.3658.0746H23.54a.469.469 0 0 0 .2523-.0734.453.453 0 0 0 .1697-.1961.4382.4382 0 0 0 .0313-.2546.4444.4444 0 0 0-.1169-.2297zM.46 6.7225h18.7815a.9411.9411 0 0 0 .367-.0742.9202.9202 0 0 0 .306-.2106l3.962-4.1394a.4442.4442 0 0 0 .117-.2297.4378.4378 0 0 0-.0314-.2546.453.453 0 0 0-.1697-.196.469.469 0 0 0-.2523-.0734H4.7596a.941.941 0 0 0-.3658.0745.9203.9203 0 0 0-.3052.2102L.1246 5.9687a.4438.4438 0 0 0-.1169.2295.4375.4375 0 0 0 .0312.2544.4512.4512 0 0 0 .1692.196.4689.4689 0 0 0 .2518.0739z"/></svg>
        </span>
        <span className="hero__int-logo" title="Bitcoin">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M23.638 14.904c-1.602 6.43-8.113 10.34-14.542 8.736C2.67 22.05-1.244 15.525.362 9.105 1.962 2.67 8.475-1.243 14.9.358c6.43 1.605 10.342 8.115 8.738 14.548v-.002zm-6.35-4.613c.24-1.59-.974-2.45-2.64-3.03l.54-2.153-1.315-.33-.525 2.107c-.345-.087-.705-.167-1.064-.25l.526-2.127-1.32-.33-.54 2.165c-.285-.067-.565-.132-.84-.2l-1.815-.45-.35 1.407s.975.225.955.236c.535.136.63.486.615.766l-1.477 5.92c-.075.166-.24.406-.614.314.015.02-.96-.24-.96-.24l-.66 1.51 1.71.426.93.242-.54 2.19 1.32.327.54-2.17c.36.1.705.19 1.05.273l-.51 2.154 1.32.33.545-2.19c2.24.427 3.93.257 4.64-1.774.57-1.637-.03-2.58-1.217-3.196.854-.193 1.5-.76 1.68-1.93h.01zm-3.01 4.22c-.404 1.64-3.157.75-4.05.53l.72-2.9c.896.23 3.757.67 3.33 2.37zm.41-4.24c-.37 1.49-2.662.735-3.405.55l.654-2.64c.744.18 3.137.524 2.75 2.084v.006z"/></svg>
        </span>
        <span className="hero__int-logo" title="X (Twitter)">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z"/></svg>
        </span>
        <span className="hero__int-logo" title="Polymarket">
          <svg width="24" height="24" viewBox="0 0 42.76 53.02" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M42.76,24.28V0L0,12.04v28.93l42.76,12.04v-28.74ZM38.63,23.12V5.42L7.21,14.27l31.42,8.85ZM35.55,26.51L4.14,17.66v17.69l31.42-8.85ZM7.21,38.75l31.42,8.85v-17.71l-31.42,8.85v.02Z"/></svg>
        </span>
      </div>
    </div>
  );
}

/* ── Hero card carousel data ─────────────────────────────────────── */

const HERO_SCENARIOS = [
  {
    alert: {
      title: 'ETH Whale Movement',
      sources: [
        { icon: 'eth', text: 'ETH $3,841 → $3,680 (-4.2%)' },
        { icon: 'x', text: '@whale_alert: 12,400 ETH moved to Coinbase' },
        { icon: 'web', text: 'coinglass.com: funding rate flipped negative' },
      ],
      badges: ['ALERT FIRED', '3 SOURCES'],
    },
    reason: {
      title: 'Bearish signal confirmed',
      sources: [
        { icon: 'x', text: 'X sentiment: 73% bearish (last 4h)' },
        { icon: 'eth', text: 'On-chain: exchange inflows +340%' },
      ],
      cost: '$0.003',
    },
    exec: { title: 'Sold 2.5 ETH on Base', detail: 'Policy approved · TX 0x8f2a...confirmed', amount: '+$9,618 USDC' },
  },
  {
    alert: {
      title: 'Polymarket Odds Shift',
      sources: [
        { icon: 'poly', text: 'Next President' },
        { icon: 'x', text: '@NateSilver: debate moved prediction markets hard' },
        { icon: 'web', text: 'fivethirtyeight.com: polling average shifted +3.2' },
      ],
      badges: ['ALERT FIRED', '3 SOURCES'],
    },
    reason: {
      title: 'Sharp odds movement detected',
      sources: [
        { icon: 'poly', text: 'Volume surge: $2.4M in last hour' },
        { icon: 'web', text: 'Historical: debate moves revert 40% within 48h' },
      ],
      cost: '$0.004',
    },
    exec: { title: 'Bought $500 YES on Polymarket', detail: 'Policy approved · Position opened', amount: '-$500 USDC' },
  },
  {
    alert: {
      title: 'Solana DeFi Yield Alert',
      sources: [
        { icon: 'sol', text: 'Marinade: stSOL yield spiked to 12.4% APY' },
        { icon: 'web', text: 'defillama.com: Solana TVL up 18% this week' },
        { icon: 'x', text: '@solana_daily: new liquidity mining program live' },
      ],
      badges: ['ALERT FIRED', '3 SOURCES'],
    },
    reason: {
      title: 'Yield opportunity confirmed',
      sources: [
        { icon: 'web', text: 'Protocol audit: verified by OtterSec' },
        { icon: 'sol', text: 'TVL stable for 14 days, no unlock events' },
      ],
      cost: '$0.002',
    },
    exec: { title: 'Deposited 50 SOL into Marinade', detail: 'Policy approved · Staked via smart account', amount: '50 stSOL' },
  },
];

/* ── Hero visual (animated cards) ────────────────────────────────── */

function HeroVisual() {
  const [sceneIdx, setSceneIdx] = useState(0);
  const [step, setStep] = useState(0);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const run = () => {
      setFading(false);
      setStep(0);
      timers.push(setTimeout(() => setStep(1), 1400));
      timers.push(setTimeout(() => setStep(2), 2800));
      timers.push(setTimeout(() => setFading(true), 5200));
      timers.push(setTimeout(() => {
        setSceneIdx(prev => (prev + 1) % HERO_SCENARIOS.length);
        setStep(0);
        setFading(false);
      }, 5800));
    };
    run();
    const iv = setInterval(run, 5800);
    return () => { clearInterval(iv); timers.forEach(clearTimeout); };
  }, []);

  const s = HERO_SCENARIOS[sceneIdx];

  return (
    <div className="hero__visual">
      <div className={`hero__cards-inner ${fading ? '' : 'hero__cards-inner--visible'}`}>
        {/* Card 1: Strategy Alert */}
        <div className={`hero__card hero__card--1 ${step >= 0 ? 'hero__card--show' : ''}`}>
          <div className="hero__card-label" style={{ color: '#eab308' }}>
            <span className="hero__card-dot hero__card-dot--yellow" />Strategy Alert
          </div>
          <div className="hero__card-title">{s.alert.title}</div>
          <div className="hero__card-sources">
            {s.alert.sources.map((src, i) => (
              <div className="hero__source" key={i}>
                <span className="hero__source-icon"><SourceIcon type={src.icon} /></span>
                <span className="hero__source-text">{src.text}</span>
              </div>
            ))}
          </div>
          <div className="hero__card-meta">
            <span className="hero__card-badge hero__card-badge--alert">{s.alert.badges[0]}</span>
            <span className="hero__card-badge hero__card-badge--sources">{s.alert.badges[1]}</span>
          </div>
        </div>

        {/* Card 2: Agent Reasoning */}
        <div className={`hero__card hero__card--2 ${step >= 1 ? 'hero__card--show' : ''}`}>
          <div className="hero__card-label" style={{ color: 'var(--accent)' }}>
            <span className="hero__card-dot hero__card-dot--purple" />Agent Reasoning
          </div>
          <div className="hero__card-title">{s.reason.title}</div>
          <div className="hero__card-sources">
            {s.reason.sources.map((src, i) => (
              <div className="hero__source" key={i}>
                <span className="hero__source-icon"><SourceIcon type={src.icon} /></span>
                <span className="hero__source-text">{src.text}</span>
              </div>
            ))}
          </div>
          <div className="hero__card-meta">
            <span style={{ color: 'var(--text-dim)', fontSize: '0.6875rem', fontFamily: 'var(--font-mono)' }}>
              LLM cost: {s.reason.cost}
            </span>
          </div>
        </div>

        {/* Card 3: Self-Custody Vault */}
        <div className={`hero__card hero__card--3 ${step >= 2 ? 'hero__card--show' : ''}`}>
          <div className="hero__card-label" style={{ color: '#22c55e' }}>
            <span className="hero__card-dot hero__card-dot--green" />Self-Custody Vault
          </div>
          <div className="hero__card-title">{s.exec.title}</div>
          <div className="hero__card-body">{s.exec.detail}</div>
          <div className="hero__card-meta">
            <span className="hero__card-badge hero__card-badge--approved">APPROVED</span>
            <span className="hero__card-amount">{s.exec.amount}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── FAQ data ────────────────────────────────────────────────────── */

const FAQ_DATA = [
  {
    q: 'What is Vincent?',
    a: 'Vincent is the infrastructure layer between you and your money. It provides AI agents with real-time search, strategies & alerts, smart LLM routing, a policy engine, and a self-custody vault \u2014 so your agent can monitor markets, execute trades, and manage money safely on your behalf.',
  },
  {
    q: 'Can I use Vincent with my own bot?',
    a: 'Yes. The Vincent skill can be added to any agent \u2014 just point it at the skills repo (github.com/HeyVincent-ai/agent-skills). Or let us deploy OpenClaw for you. Either way you get the same vault, policies, and audit trail.',
  },
  {
    q: 'How are keys kept safe?',
    a: "Your agent's signing key is managed by Lit Protocol's HSM network, completely airgapped from the agent runtime. The AI requests actions but never touches the key. On-chain, smart accounts let you claim full self-custody at any time \u2014 you're never locked in.",
  },
  {
    q: 'What happens if the AI is compromised?',
    a: 'Nothing happens to your secrets. The agent runtime is deliberately separated from the secret vault. Prompt injection, malicious plugins, or a full runtime breach cannot access your credentials. You retain full control and can revoke access at any time.',
  },
  {
    q: 'What are Strategies?',
    a: 'Strategies are custom monitoring rules you define for your agent. Each strategy contains alerts that fire when specific conditions are met \u2014 price movements, sentiment shifts, on-chain events, or anything else you want to track. You can toggle strategies on or off at any time.',
  },
  {
    q: 'How are Alerts different from cron jobs?',
    a: 'Traditional bots run LLM inference on every cron tick, burning tokens whether anything happened or not. Vincent alerts only fire LLM tokens when a strategy condition is actually met \u2014 making them dramatically more cost-efficient for monitoring tasks.',
  },
  {
    q: 'What can the agent search?',
    a: 'Your agent has access to real-time internet search for market data, news, and web-accessible information, plus full X (Twitter) API search for sentiment analysis, breaking news, and alpha discovery.',
  },
  {
    q: 'How does Smart LLM Routing work?',
    a: 'Vincent intelligently routes requests across multiple LLM providers to minimize cost while maintaining quality. Simple monitoring tasks use cheaper, faster models. Complex reasoning and decision-making gets routed to more capable models automatically.',
  },
  {
    q: 'What kinds of secrets can Vincent manage?',
    a: 'Any secret. API keys, crypto wallet credentials, payment processor tokens, vendor credentials \u2014 Vincent treats them all the same. The difference is in the policies you assign: spending limits, approval requirements, action restrictions, and more.',
  },
  {
    q: 'What blockchains are supported?',
    a: 'Vincent supports all chains. EVM, Solana, Bitcoin, Sui, and more \u2014 if it has a blockchain, Vincent can work with it.',
  },
  {
    q: 'Is there a free trial?',
    a: 'Yes. Every hosted agent comes with a 7-day free trial and $25 of free LLM credit. You can also use the Skills Only plan to add Vincent capabilities to your own bot at a lower cost.',
  },
];

/* ── Landing page ────────────────────────────────────────────────── */

export default function Landing() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <PageShell active="home">
      {/* Hero */}
      <section className="hero">
        <div className="container">
          <div className="hero__split">
            <div className="hero__text">
              <h1 className="anim">
                Your Money Has an <em>Operator</em> Now.
              </h1>
              <p className="anim anim-d1">
                Search, strategies, alerts, smart routing, and a self-custody vault. Add the Vincent
                skill to any agent or deploy a hosted one &mdash; monitor markets and transact across
                chains without giving up your keys.
              </p>
              <div className="hero__ctas anim anim-d2">
                <Link className="btn btn-primary btn-lg" to="/login">
                  Launch Your Agent &mdash; Free
                </Link>
                <SkillsCopyButton className="btn btn-secondary btn-lg">
                  Get the Skills
                </SkillsCopyButton>
              </div>
              <IntegrationLogos />
            </div>
            <HeroVisual />
          </div>
        </div>
      </section>

      {/* Capabilities */}
      <section className="section section--alt">
        <div className="container">
          <div className="section-header">
            <div className="section-label">Capabilities</div>
            <h2>Everything your agent needs to put money to work</h2>
          </div>
          <div className="capabilities-grid">
            <div className="capability-card">
              <div className="card-icon"><SearchIcon24 /></div>
              <h3>Real-time Internet Search</h3>
              <p>Your agent searches the live web for market data, news, and opportunities in real time.</p>
            </div>
            <div className="capability-card">
              <div className="card-icon"><XSearchIcon24 /></div>
              <h3>X (Twitter) Search</h3>
              <p>Full API access to search anything on X &mdash; sentiment, breaking news, alpha, and announcements.</p>
            </div>
            <div className="capability-card">
              <div className="card-icon"><TargetIcon24 /></div>
              <h3>Strategies &amp; Alerts</h3>
              <p>Custom monitoring strategies with event-driven alerts. Your agent only reasons when conditions are met &mdash; no wasted LLM tokens.</p>
            </div>
            <div className="capability-card">
              <div className="card-icon"><PulseIcon24 /></div>
              <h3>Smart LLM Routing</h3>
              <p>Intelligent model routing keeps LLM costs down. Simple tasks get cheap models; complex reasoning gets the best.</p>
            </div>
            <div className="capability-card">
              <div className="card-icon"><ShieldIcon24 /></div>
              <h3>Self-Custody Vault</h3>
              <p>Agent key managed via Lit HSM, airgapped from the runtime. Smart accounts give you on-chain self-custody &mdash; claim your keys anytime.</p>
            </div>
            <div className="capability-card">
              <div className="card-icon"><BoltIcon24 /></div>
              <h3>Policy Engine</h3>
              <p>Spending limits, action restrictions, and multi-party approval flows. Your agent only does what your policies allow.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Why Vincent (moved up — breaks up Capabilities and Features) */}
      <section className="section" id="why-vincent">
        <div className="container">
          <div className="section-header">
            <div className="section-label">Why Vincent</div>
            <h2>Stop babysitting your bot</h2>
          </div>
          <div className="compare-grid">
            <div className="compare-col compare-col--old">
              <div className="compare-col__header">Traditional bots</div>
              <ul>
                <li><span className="compare-x">&times;</span> Secrets hardcoded or in .env files</li>
                <li><span className="compare-x">&times;</span> LLM runs on every cron tick, burning tokens</li>
                <li><span className="compare-x">&times;</span> No spending limits or approval gates</li>
                <li><span className="compare-x">&times;</span> Single model, single chain</li>
                <li><span className="compare-x">&times;</span> One compromise = everything lost</li>
              </ul>
            </div>
            <div className="compare-col compare-col--new">
              <div className="compare-col__header">Vincent</div>
              <ul>
                <li><span className="compare-check">&#10003;</span> Agent key airgapped via Lit + on-chain self-custody</li>
                <li><span className="compare-check">&#10003;</span> Alerts fire only when conditions are met</li>
                <li><span className="compare-check">&#10003;</span> Policy engine with multi-party approvals</li>
                <li><span className="compare-check">&#10003;</span> Smart LLM routing across providers + chains</li>
                <li><span className="compare-check">&#10003;</span> Compromised agent can&rsquo;t access keys</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="section section--alt">
        <div className="container">
          <div className="section-header">
            <div className="section-label">Features</div>
            <h2>Intelligent agents, enterprise-grade security</h2>
          </div>
          <div className="highlights-grid">
            <div className="highlight">
              <div className="card-icon"><BoltIcon24 /></div>
              <h3>Strategies &amp; Alerts</h3>
              <p>Custom strategies with event-driven alerts. Your agent only reasons when conditions are met.</p>
            </div>
            <div className="highlight">
              <div className="card-icon"><ShieldIcon24 /></div>
              <h3>Self-Custody Vault</h3>
              <p>Lit-managed agent key, airgapped from runtime. Smart accounts for on-chain self-custody.</p>
            </div>
            <div className="highlight">
              <div className="card-icon"><PulseIcon24 /></div>
              <h3>Smart LLM Routing</h3>
              <p>Intelligent model routing minimizes LLM costs without sacrificing quality.</p>
            </div>
            <div className="highlight">
              <div className="card-icon"><TerminalIcon24 /></div>
              <h3>Advanced Mode</h3>
              <p>Access the full OpenClaw runtime &mdash; install skills, customize behavior, extend capabilities.</p>
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <Link className="section-link" to="/features">
              See all features
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="section" id="pricing">
        <div className="container">
          <div className="section-header">
            <div className="section-label">Pricing</div>
            <h2>Start free, scale when you&rsquo;re ready</h2>
          </div>
          <div className="pricing-grid" style={{ maxWidth: 700, margin: '0 auto' }}>
            <div className="pricing-card">
              <h3>Skills Only</h3>
              <div className="pricing-card__price">
                $10<span>/mo</span>
              </div>
              <div className="pricing-card__desc">Add Vincent to any existing agent</div>
              <ul className="pricing-card__features">
                <li><CheckSvg /> Airgapped secret manager</li>
                <li><CheckSvg /> Policy engine &amp; spending limits</li>
                <li><CheckSvg /> Multi-party approval flows</li>
                <li><CheckSvg /> Skills file for any agent</li>
                <li><CheckSvg /> Bring your own bot &amp; LLM</li>
              </ul>
              <SkillsCopyButton className="btn btn-secondary">Get the Skills Repo</SkillsCopyButton>
            </div>
            <div className="pricing-card pricing-card--featured">
              <div className="pricing-card__badge">Most Popular</div>
              <h3>Hosted Agent</h3>
              <div className="pricing-card__price">
                $25<span>/mo</span>
              </div>
              <div className="pricing-card__desc">Per agent, billed monthly</div>
              <ul className="pricing-card__features">
                <li><CheckSvg /> Everything in Skills Only</li>
                <li><CheckSvg /> 7-day free trial</li>
                <li><CheckSvg /> 1 fully hosted, self-improving agent</li>
                <li><CheckSvg /> $25 free LLM credit to start</li>
                <li><CheckSvg /> Priority support</li>
              </ul>
              <Link className="btn btn-primary" to="/login">
                Start Free Trial
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="section section--alt" id="faq">
        <div className="container">
          <div className="section-header">
            <div className="section-label">FAQ</div>
            <h2>Frequently asked questions</h2>
          </div>
          <div className="container-narrow" style={{ padding: 0 }}>
            <div className="faq-list">
              {FAQ_DATA.map((item, i) => (
                <div className={`faq-item ${openFaq === i ? 'faq-item--open' : ''}`} key={i}>
                  <button
                    className="faq-question"
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  >
                    {item.q}
                    <ChevronDown size={20} />
                  </button>
                  {openFaq === i && <div className="faq-answer">{item.a}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
