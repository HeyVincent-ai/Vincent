import { useState } from 'react';
import { Link } from 'react-router-dom';
import PageShell, { CheckSvg, ChevronDown } from '../components/PageShell';

const FAQ_DATA = [
  {
    q: 'What is Vincent?',
    a: 'Vincent is a system that lets people and groups safely share execution authority over money and APIs with an AI in the loop. It combines a hosted AI runtime with an airgapped secret manager to ensure your credentials are never exposed \u2014 even if the AI is compromised.',
  },
  {
    q: 'How does the airgapped architecture work?',
    a: 'Vincent has two layers. The AI runtime handles conversation and skills but never holds secrets. When it needs to execute an action (like making a payment or calling an API), it sends a request to the Vincent mediator, which evaluates your policies and executes the action using credentials stored in a hardware-backed vault. The AI never sees the raw credentials.',
  },
  {
    q: 'Can I use Vincent with my own AI agent?',
    a: 'Yes. You can either use our hosted bot on Telegram or give your existing agent the Vincent skills.md file. Either way, the airgapped secret manager protects your credentials with the same policies and audit trail. There\u2019s no lock-in.',
  },
  {
    q: 'What happens if the AI is compromised?',
    a: 'Nothing happens to your secrets. The AI runtime is deliberately separated from the secret vault. Prompt injection, malicious plugins, or a full runtime breach cannot access your credentials. The admin retains full control and can revoke access at any time.',
  },
  {
    q: 'What kinds of secrets can Vincent manage?',
    a: 'Any secret. API keys, crypto wallet credentials, payment processor tokens, vendor credentials \u2014 Vincent treats them all the same. The difference is in the policies you assign to each one: spending limits, approval requirements, action restrictions, and more.',
  },
  {
    q: 'How does multi-party approval work?',
    a: 'You can require n-of-m approval for any action. For example, require 2-of-3 team members to approve withdrawals over $1,000 while letting the AI handle smaller transactions autonomously. Approval flows are configurable per secret and per action type.',
  },
  {
    q: 'Is there a free trial?',
    a: 'Yes. Every hosted agent comes with a 7-day free trial and $25 of free LLM credit to get started. You can also use the skills.md file with your own agent at no cost.',
  },
];

export default function Landing() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <PageShell active="home">
      {/* Hero */}
      <section className="hero">
        <div className="container">
          <div className="hero__badge anim">Now in early access</div>
          <h1 className="anim anim-d1">
            Give your AI <em>safe authority</em> over money and APIs
          </h1>
          <p className="anim anim-d2">
            Vincent lets people and groups safely delegate execution authority to AI &mdash; with
            policies, spending limits, and an airgapped secret manager that keeps credentials safe
            even if the AI is compromised.
          </p>
          <div className="hero__paths anim anim-d3">
            <div className="hero__path">
              <h3>For agents</h3>
              <p>
                Add the Vincent skills file to your AI agent and give it safe access to secrets and
                execution.
              </p>
              <Link className="btn btn-secondary" to="/skills">
                Add to Your Agent
              </Link>
            </div>
            <div className="hero__path">
              <h3>For humans</h3>
              <p>
                Sign up and start managing secrets, policies, and AI authority from the dashboard.
              </p>
              <Link className="btn btn-primary" to="/login">
                Start Free Trial
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="section" id="how-it-works">
        <div className="container">
          <div className="section-header">
            <div className="section-label">How It Works</div>
            <h2>Three steps to safe AI authority</h2>
          </div>
          <div className="steps">
            <div className="step">
              <div className="step__number">01</div>
              <h3>Add your secrets</h3>
              <p>
                Store API keys, wallet credentials, or any secret in the airgapped vault. You become
                the admin with full control.
              </p>
            </div>
            <div className="step">
              <div className="step__number">02</div>
              <h3>Set policies and roles</h3>
              <p>
                Define who can do what. Set spending limits, approval flows, and access levels for
                people and AI agents.
              </p>
            </div>
            <div className="step">
              <div className="step__number">03</div>
              <h3>Let AI act safely</h3>
              <p>
                Your agent requests actions through Vincent. Policies are evaluated in real time.
                Secrets never leave the vault.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section className="section section--alt">
        <div className="container">
          <div className="section-header">
            <div className="section-label">Use Cases</div>
            <h2>Built for people who need AI to act</h2>
          </div>
          <div className="use-cases-grid">
            <div className="use-case-card">
              <h3>Crypto & DeFi Groups</h3>
              <ul>
                <li>
                  <CheckSvg /> Polymarket betting groups
                </li>
                <li>
                  <CheckSvg /> DAO treasury management
                </li>
                <li>
                  <CheckSvg /> Shared DeFi positions
                </li>
              </ul>
            </div>
            <div className="use-case-card">
              <h3>Developers & API Power Users</h3>
              <ul>
                <li>
                  <CheckSvg /> 20+ API keys, one dashboard
                </li>
                <li>
                  <CheckSvg /> Scoped AI access per project
                </li>
                <li>
                  <CheckSvg /> Credential rotation built in
                </li>
              </ul>
            </div>
            <div className="use-case-card">
              <h3>Teams & Startups</h3>
              <ul>
                <li>
                  <CheckSvg /> Startup treasury with approval flows
                </li>
                <li>
                  <CheckSvg /> Shared vendor credentials
                </li>
                <li>
                  <CheckSvg /> Team API key management
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="section">
        <div className="container">
          <div className="section-header">
            <div className="section-label">Features</div>
            <h2>Enterprise-grade security, zero complexity</h2>
          </div>
          <div className="highlights-grid">
            <div className="highlight">
              <div className="card-icon">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
                  <path d="m9 12 2 2 4-4" />
                </svg>
              </div>
              <h3>Airgapped Vault</h3>
              <p>Secrets stored in hardware-backed HSM, completely separated from AI.</p>
            </div>
            <div className="highlight">
              <div className="card-icon">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" x2="8" y1="13" y2="13" />
                  <line x1="16" x2="8" y1="17" y2="17" />
                  <line x1="10" x2="8" y1="9" y2="9" />
                </svg>
              </div>
              <h3>Granular Policies</h3>
              <p>Spending limits, action restrictions, and composable rules for exact control.</p>
            </div>
            <div className="highlight">
              <div className="card-icon">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <h3>Multi-Party Auth</h3>
              <p>n-of-m approval flows for high-stakes actions across teams and groups.</p>
            </div>
            <div className="highlight">
              <div className="card-icon">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              </div>
              <h3>Advanced Mode</h3>
              <p>
                Access the full OpenClawd runtime — install skills, customize behavior, extend
                capabilities.
              </p>
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <Link className="section-link" to="/features">
              See all features
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="section section--alt" id="pricing">
        <div className="container">
          <div className="section-header">
            <div className="section-label">Pricing</div>
            <h2>Start free, scale when ready</h2>
          </div>
          <div style={{ maxWidth: 420, margin: '0 auto' }}>
            <div className="pricing-card pricing-card--featured">
              <div className="pricing-card__price">
                $25<span>/mo</span>
              </div>
              <div className="pricing-card__desc">Per hosted agent, billed monthly</div>
              <ul className="pricing-card__features">
                <li>
                  <CheckSvg /> 7-day free trial
                </li>
                <li>
                  <CheckSvg /> 1 fully hosted agent
                </li>
                <li>
                  <CheckSvg /> $25 free LLM credit to start
                </li>
                <li>
                  <CheckSvg /> Priority support
                </li>
                <li>
                  <CheckSvg /> LLM API fees not included
                </li>
              </ul>
              <Link className="btn btn-primary" to="/login">
                Start Free Trial
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="section" id="faq">
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
