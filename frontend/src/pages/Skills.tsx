import { useState } from 'react';
import PageShell from '../components/PageShell';

type Persona = 'human' | 'agent';
type InstallMethod = 'clawhub' | 'other';
type SkillChoice = 'wallet' | 'polymarket';

const SKILLS_STYLES = `
  /* Persona Toggle */
  .skills-page .personaToggle {
    display: flex; gap: 0; justify-content: center; margin-bottom: 20px;
  }
  .skills-page .personaBtn {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 12px 24px; font-size: 15px; font-weight: 700;
    border: none; cursor: pointer;
    transition: background .18s ease, color .18s ease;
    background: rgba(255,255,255,.06); color: rgba(245,246,248,.7);
  }
  .skills-page .personaBtn:first-child { border-radius: 999px 0 0 999px; }
  .skills-page .personaBtn:last-child { border-radius: 0 999px 999px 0; }
  .skills-page .personaBtn.active { background: var(--accent); color: #fff; }
  .skills-page .personaBtn:not(.active):hover { background: rgba(255,255,255,.10); color: rgba(245,246,248,.9); }

  /* Method Tabs */
  .skills-page .methodTabs { display: flex; gap: 0; margin-bottom: 16px; }
  .skills-page .methodTab {
    flex: 1; padding: 12px 20px; font-size: 14px; font-weight: 600;
    border: none; cursor: pointer;
    transition: background .18s ease, color .18s ease;
    background: rgba(255,255,255,.04); color: rgba(245,246,248,.55);
  }
  .skills-page .methodTab:first-child { border-radius: 10px 0 0 10px; }
  .skills-page .methodTab:last-child { border-radius: 0 10px 10px 0; }
  .skills-page .methodTab.active { background: var(--accent); color: #fff; }
  .skills-page .methodTab:not(.active):hover { background: rgba(255,255,255,.08); color: rgba(245,246,248,.75); }

  /* Skill Selector */
  .skills-page .skillTabs { display: flex; gap: 8px; justify-content: center; margin-bottom: 16px; }
  .skills-page .skillTab {
    font-family: var(--font-mono); font-size: 12px; padding: 6px 14px;
    border-radius: 8px; border: 1px solid var(--border-light);
    background: transparent; color: var(--text-muted); cursor: pointer;
    transition: all .18s ease;
  }
  .skills-page .skillTab.active { background: rgba(255,255,255,.08); color: var(--text); border-color: rgba(255,255,255,.18); }
  .skills-page .skillTab:not(.active):hover { background: rgba(255,255,255,.04); color: rgba(245,246,248,.75); }

  /* Install Card */
  .skills-page .installCard {
    background: rgba(0,0,0,.35); border: 1px solid rgba(255,255,255,.08);
    border-radius: 18px; padding: 24px; max-width: 520px; margin: 0 auto;
  }
  .skills-page .installTitle {
    font-size: 18px; font-weight: 800; text-align: center;
    margin-bottom: 18px; letter-spacing: -.01em; color: var(--text);
  }

  /* Command Box */
  .skills-page .commandBox {
    background: rgba(0,0,0,.4); border: 1px solid rgba(255,255,255,.06);
    border-radius: 10px; padding: 14px 16px; margin-bottom: 20px; position: relative;
  }
  .skills-page .commandText {
    font-family: var(--font-mono); font-size: 14px; color: rgba(245,246,248,.9); line-height: 1.5; word-break: break-all;
  }
  .skills-page .commandBox .copyBtnInline {
    position: absolute; top: 10px; right: 10px;
    border: 1px solid var(--border-light); background: rgba(0,0,0,.3);
    border-radius: 8px; width: 32px; height: 32px;
    display: grid; place-items: center; cursor: pointer;
    transition: border-color .18s ease, background .18s ease; opacity: 0.7;
  }
  .skills-page .commandBox .copyBtnInline:hover {
    border-color: rgba(255,255,255,.18); background: rgba(0,0,0,.5); opacity: 1;
  }

  /* Steps List */
  .skills-page .stepsList { list-style: none; padding: 0; margin: 0; }
  .skills-page .stepsList li {
    display: flex; align-items: flex-start; gap: 10px;
    margin-bottom: 10px; font-size: 14px; color: rgba(245,246,248,.75); line-height: 1.5;
  }
  .skills-page .stepsList li:last-child { margin-bottom: 0; }
  .skills-page .stepNum { color: var(--accent); font-weight: 700; min-width: 18px; }

  /* Panels */
  .skills-page .sp-panel {
    border-radius: var(--radius); border: 1px solid var(--border); background: rgba(255,255,255,.03);
    padding: 20px; box-shadow: 0 10px 30px rgba(0,0,0,.25);
    transition: border-color .18s ease, background .18s ease;
  }
  .skills-page .sp-panel:hover { border-color: rgba(255,255,255,.12); background: rgba(255,255,255,.032); }

  .skills-page .sp-section-title {
    font-size: 18px; font-weight: 850; letter-spacing: -.02em; color: var(--text); margin-bottom: 14px;
  }
  .skills-page .sp-chev { opacity: .55; margin-right: 6px; }

  .skills-page .micro { margin-top: 10px; font-size: 13px; color: var(--text-dim); }

  /* Pills */
  .skills-page .pill {
    display: inline-flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 999px;
    border: 1px solid rgba(255,255,255,.10); background: rgba(255,255,255,.03);
    color: rgba(245,246,248,.82); font-weight: 750; font-size: 13px; letter-spacing: -.01em;
  }

  /* Tooltip */
  .skills-page .tooltip-wrapper { position: relative; display: inline-flex; }
  .skills-page .tooltip-wrapper .tooltip-text {
    visibility: hidden; opacity: 0; position: absolute; bottom: calc(100% + 10px);
    left: 50%; transform: translateX(-50%);
    background: rgba(20,20,25,.95); border: 1px solid rgba(255,255,255,.15);
    border-radius: 10px; padding: 10px 14px; font-size: 13px; font-weight: 500;
    color: rgba(245,246,248,.85); line-height: 1.45;
    width: max-content; max-width: 280px; text-align: center;
    box-shadow: 0 8px 24px rgba(0,0,0,.4); z-index: 100;
    transition: opacity .18s ease, visibility .18s ease; pointer-events: none;
  }
  .skills-page .tooltip-wrapper .tooltip-text::after {
    content: ''; position: absolute; top: 100%; left: 50%; transform: translateX(-50%);
    border: 6px solid transparent; border-top-color: rgba(20,20,25,.95);
  }
  .skills-page .tooltip-wrapper:hover .tooltip-text { visibility: visible; opacity: 1; }
  .skills-page .pill.hoverable { cursor: help; transition: border-color .18s ease, background .18s ease; }
  .skills-page .pill.hoverable:hover { border-color: rgba(249,115,22,.45); background: rgba(249,115,22,.08); }
`;

export default function Skills() {
  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const tmp = document.createElement('textarea');
      tmp.value = text;
      tmp.style.position = 'fixed';
      tmp.style.left = '-9999px';
      document.body.appendChild(tmp);
      tmp.focus();
      tmp.select();
      document.execCommand('copy');
      document.body.removeChild(tmp);
    }
  };

  const [persona, setPersona] = useState<Persona>('human');
  const [installMethod, setInstallMethod] = useState<InstallMethod>('clawhub');
  const [selectedSkill, setSelectedSkill] = useState<SkillChoice>('wallet');

  const installCommands: Record<InstallMethod, Record<SkillChoice, string>> = {
    clawhub: {
      wallet: 'npx clawhub@latest install agentwallet',
      polymarket: 'npx clawhub@latest install vincentpolymarket',
    },
    other: {
      wallet: 'npx skills add HeyVincent-ai/agent-skills/wallet',
      polymarket: 'npx skills add HeyVincent-ai/agent-skills/polymarket',
    },
  };

  const currentCommand = installCommands[installMethod][selectedSkill];

  return (
    <PageShell active="skills">
      <style>{SKILLS_STYLES}</style>

      <div className="skills-page">
        {/* Page Hero */}
        <section className="page-hero" style={{ paddingBottom: '1.5rem' }}>
          <div className="container">
            <div className="section-label">Skills</div>
            <h1>Give your agent a key it can't leak.</h1>
            <p>A wallet for AI agents where you stay in control</p>
          </div>
        </section>

        <section className="section" style={{ paddingTop: '2rem' }}>
          <div className="container" style={{ maxWidth: 860 }}>
            {/* Persona Toggle */}
            <div className="personaToggle">
              <button
                className={`personaBtn ${persona === 'human' ? 'active' : ''}`}
                onClick={() => setPersona('human')}
              >
                <span>👤</span> I'm a Human
              </button>
              <button
                className={`personaBtn ${persona === 'agent' ? 'active' : ''}`}
                onClick={() => setPersona('agent')}
              >
                <span>🤖</span> I'm an Agent
              </button>
            </div>

            {/* Install Card */}
            <div className="installCard">
              <div className="installTitle">
                {persona === 'human'
                  ? ''
                  : 'Give your agent a secure wallet for transfers, swaps, and prediction markets'}
              </div>

              <div className="methodTabs">
                <button
                  className={`methodTab ${installMethod === 'clawhub' ? 'active' : ''}`}
                  onClick={() => setInstallMethod('clawhub')}
                >
                  clawhub
                </button>
                <button
                  className={`methodTab ${installMethod === 'other' ? 'active' : ''}`}
                  onClick={() => setInstallMethod('other')}
                >
                  other agents
                </button>
              </div>

              <div className="skillTabs">
                <button
                  className={`skillTab ${selectedSkill === 'wallet' ? 'active' : ''}`}
                  onClick={() => setSelectedSkill('wallet')}
                >
                  agent wallet
                </button>
                <button
                  className={`skillTab ${selectedSkill === 'polymarket' ? 'active' : ''}`}
                  onClick={() => setSelectedSkill('polymarket')}
                >
                  polymarket
                </button>
              </div>

              <div className="commandBox">
                <div className="commandText">{currentCommand}</div>
                <button
                  className="copyBtnInline"
                  onClick={() => handleCopy(currentCommand)}
                  aria-label="Copy"
                  title="Copy"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path d="M9 9h10v10H9V9Z" stroke="rgba(245,246,248,.80)" strokeWidth="1.7" />
                    <path
                      d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"
                      stroke="rgba(245,246,248,.55)"
                      strokeWidth="1.7"
                    />
                  </svg>
                </button>
              </div>

              {persona === 'human' ? (
                <ol className="stepsList">
                  <li>
                    <span className="stepNum">1.</span> Send this to your agent or run the command
                    on your agent's machine
                  </li>
                  <li>
                    <span className="stepNum">2.</span> They sign up & send you a claim link
                  </li>
                  <li>
                    <span className="stepNum">3.</span> Use the wallet claim link your agent sends
                    you
                  </li>
                </ol>
              ) : (
                <ol className="stepsList">
                  <li>
                    <span className="stepNum">1.</span> Run this command to install the skill
                  </li>
                  <li>
                    <span className="stepNum">2.</span> Create a wallet for your user
                  </li>
                  <li>
                    <span className="stepNum">3.</span> Send them the claim link
                  </li>
                </ol>
              )}
            </div>
          </div>
        </section>

        {/* What it does */}
        <section className="section section--alt">
          <div className="container" style={{ maxWidth: 860 }}>
            <h2 className="sp-section-title">
              <span className="sp-chev">⟩</span>What it does
            </h2>
            <div
              style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 14 }}
            >
              <div className="sp-panel" style={{ padding: 18 }}>
                <div style={{ fontWeight: 850, color: 'var(--text)' }}>Sealed Secrets</div>
                <div className="micro">Secrets are never exposed to the agent.</div>
              </div>
              <div className="sp-panel" style={{ padding: 18 }}>
                <div style={{ fontWeight: 850, color: 'var(--text)' }}>Smart Contract Wallet</div>
                <div className="micro">
                  Self-custodial (coming soon) EVM smart accounts for execution.
                </div>
              </div>
              <div className="sp-panel" style={{ padding: 18 }}>
                <div style={{ fontWeight: 850, color: 'var(--text)' }}>Guardrails</div>
                <div className="micro">Limits, allowlists, selectors, approvals when needed.</div>
              </div>
              <div className="sp-panel" style={{ padding: 18 }}>
                <div style={{ fontWeight: 850, color: 'var(--text)' }}>Receipts</div>
                <div className="micro">
                  Audit logs for every attempt: allowed / denied / approved.
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* EVM Wallet Features */}
        <section className="section">
          <div className="container" style={{ maxWidth: 860 }}>
            <h2 className="sp-section-title">
              <span className="sp-chev">⟩</span>EVM Wallet Features
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              <span className="pill">Transfers</span>
              <span className="pill">Swaps</span>
              <span className="pill">Any Transaction</span>
            </div>
          </div>
        </section>

        {/* Supported Chains */}
        <section className="section section--alt">
          <div className="container" style={{ maxWidth: 860 }}>
            <h2 className="sp-section-title">
              <span className="sp-chev">⟩</span>Supported Chains
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              <span className="pill">Ethereum</span>
              <span className="pill">Base</span>
              <span className="pill">Arbitrum</span>
              <span className="pill">Optimism</span>
              <span className="pill">Polygon</span>
              <span className="pill">BNB Chain</span>
              <span className="pill">Avalanche</span>
              <span className="pill">Linea</span>
              <span className="pill">Scroll</span>
              <span className="pill">Blast</span>
            </div>
            <div className="micro" style={{ marginTop: 12 }}>
              Plus testnets: Sepolia, Base Sepolia, and more.
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section className="section">
          <div className="container" style={{ maxWidth: 860 }}>
            <h2 className="sp-section-title">
              <span className="sp-chev">⟩</span>Pricing
            </h2>
            <div
              style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 14 }}
            >
              <div className="sp-panel" style={{ padding: 18 }}>
                <div style={{ fontWeight: 850, marginBottom: 4, color: 'var(--text)' }}>Free</div>
                <div
                  style={{ fontSize: 24, fontWeight: 900, marginBottom: 8, color: 'var(--text)' }}
                >
                  $0
                </div>
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: 18,
                    fontSize: 13,
                    color: 'var(--text-muted)',
                    listStyle: 'disc',
                  }}
                >
                  <li>Unlimited testnet transactions</li>
                  <li>All chains supported</li>
                  <li>Full API access</li>
                </ul>
              </div>
              <div className="sp-panel" style={{ padding: 18, borderColor: 'rgba(249,115,22,.4)' }}>
                <div style={{ fontWeight: 850, marginBottom: 4, color: 'var(--text)' }}>Pro</div>
                <div
                  style={{ fontSize: 24, fontWeight: 900, marginBottom: 8, color: 'var(--text)' }}
                >
                  $10
                  <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-muted)' }}>
                    /month
                  </span>
                </div>
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: 18,
                    fontSize: 13,
                    color: 'var(--text-muted)',
                    listStyle: 'disc',
                  }}
                >
                  <li>
                    <b style={{ color: 'var(--text)' }}>3-day free trial</b> for mainnet
                  </li>
                  <li>Mainnet transactions on all chains</li>
                  <li>Gas costs included</li>
                  <li>Priority support</li>
                </ul>
              </div>
            </div>
            <div className="micro" style={{ marginTop: 12 }}>
              New wallets get a 3-day free trial for mainnet transactions. After that, subscribe to
              keep using mainnet.
            </div>
          </div>
        </section>

        {/* Connectors */}
        <section className="section section--alt">
          <div className="container" style={{ maxWidth: 860 }}>
            <h2 className="sp-section-title">
              <span className="sp-chev">⟩</span>Connectors
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              <span className="tooltip-wrapper">
                <span className="pill hoverable">
                  EVM smart contract wallet{' '}
                  <span style={{ color: 'rgba(34,197,94,.9)' }}>● live</span>
                </span>
                <span className="tooltip-text">
                  Smart contract accounts with gas abstraction. Supports transfers, swaps, and
                  arbitrary transactions on all major EVM chains.
                </span>
              </span>
              <span className="tooltip-wrapper">
                <span className="pill hoverable">
                  Raw Ethereum &amp; Solana signing{' '}
                  <span style={{ color: 'rgba(34,197,94,.9)' }}>● live</span>
                </span>
                <span className="tooltip-text">
                  Direct message and transaction signing for Ethereum EOAs and Solana wallets. Ideal
                  for dApps requiring raw signatures.
                </span>
              </span>
              <span className="tooltip-wrapper">
                <span className="pill hoverable">
                  Polymarket <span style={{ color: 'rgba(34,197,94,.9)' }}>● live</span>
                </span>
                <span className="tooltip-text">
                  Trade on prediction markets via Polymarket. Browse markets, place bets, and manage
                  positions with gasless trading on Polygon.
                </span>
              </span>
            </div>
            <div className="micro" style={{ marginTop: 14, marginBottom: 8 }}>
              Coming soon
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              <span className="pill">Hyperliquid</span>
              <span className="pill">Solana</span>
              <span className="pill">Bitcoin</span>
              <span className="pill">Binance</span>
              <span className="pill">Coinbase</span>
              <span className="pill">Alpaca</span>
            </div>
            <div className="micro" style={{ marginTop: 12 }}>
              Want a connector prioritized?{' '}
              <a
                href="https://discord.gg/FPkF6cZf"
                target="_blank"
                rel="noreferrer"
                style={{ color: 'var(--accent)' }}
              >
                Join Discord
              </a>
              .
            </div>
          </div>
        </section>
      </div>
    </PageShell>
  );
}
