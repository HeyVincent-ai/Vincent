import { useState } from 'react';
import { Link } from 'react-router-dom';
import PageShell, { CheckSvg, ChevronDown } from '../components/PageShell';

const FAQ_DATA = [
  {
    q: 'What is Vincent?',
    a: 'Vincent deploys self-improving AI agents that can safely handle money and APIs on your behalf. Each agent runs on the OpenClawd runtime and comes with an airgapped secret manager \u2014 so your credentials are never exposed, even if the AI is compromised.',
  },
  {
    q: 'What makes Vincent agents self-improving?',
    a: 'Vincent agents learn from every interaction. They refine their strategies, remember what works, and adapt to your workflows over time \u2014 getting better without manual fine-tuning.',
  },
  {
    q: 'How are secrets kept safe?',
    a: 'Your agent never holds secrets directly. When it needs to execute an action (like making a payment or calling an API), the request goes through a mediator that evaluates your policies and executes using credentials stored in a hardware-backed vault. The AI never sees raw credentials.',
  },
  {
    q: 'Can I use Vincent skills with my own bot?',
    a: 'Yes. If you already run your own agent, you can add the Vincent skills file to give it access to the airgapped secret manager and policy engine \u2014 no migration needed. That\u2019s what the Skills Only plan is for.',
  },
  {
    q: 'What happens if the AI is compromised?',
    a: 'Nothing happens to your secrets. The agent runtime is deliberately separated from the secret vault. Prompt injection, malicious plugins, or a full runtime breach cannot access your credentials. You retain full control and can revoke access at any time.',
  },
  {
    q: 'What kinds of secrets can Vincent manage?',
    a: 'Any secret. API keys, crypto wallet credentials, payment processor tokens, vendor credentials \u2014 Vincent treats them all the same. The difference is in the policies you assign: spending limits, approval requirements, action restrictions, and more.',
  },
  {
    q: 'How does multi-party approval work?',
    a: 'You can require n-of-m approval for any action. For example, require 2-of-3 team members to approve withdrawals over $1,000 while letting the agent handle smaller transactions autonomously. Approval flows are configurable per secret and per action type.',
  },
  {
    q: 'Is there a free trial?',
    a: 'Yes. Every hosted agent comes with a 7-day free trial and $25 of free LLM credit. You can also use the Skills Only plan to add Vincent capabilities to your own bot at a lower cost.',
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
            Deploy a <em>self-improving AI agent</em> that&rsquo;s safe to use with money
          </h1>
          <p className="anim anim-d2">
            Vincent deploys AI agents that get smarter over time &mdash; and come with built-in
            secret management, spending policies, and an airgapped vault so you can trust them with
            real credentials and real money.
          </p>
          <div className="hero__paths anim anim-d3">
            <div className="hero__path">
              <h3>Deploy an agent</h3>
              <p>
                Get a fully hosted, self-improving AI agent with safe secret management and
                policy controls out of the box.
              </p>
              <Link className="btn btn-primary" to="/login">
                Start Free Trial
              </Link>
            </div>
            <div className="hero__path">
              <h3>Already have a bot?</h3>
              <p>
                Add Vincent skills to your existing agent to give it safe access to secrets and
                policy-controlled execution.
              </p>
              <Link className="btn btn-secondary" to="/skills">
                Get the Skills File
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
            <h2>From deploy to autonomous in minutes</h2>
          </div>
          <div className="steps">
            <div className="step">
              <div className="step__number">01</div>
              <h3>Deploy your agent</h3>
              <p>
                Launch a hosted AI agent in one click. It comes pre-configured with the OpenClawd
                runtime and the airgapped secret vault.
              </p>
            </div>
            <div className="step">
              <div className="step__number">02</div>
              <h3>Add secrets &amp; set policies</h3>
              <p>
                Store API keys, wallet credentials, or any secret. Set spending limits, approval
                flows, and access controls.
              </p>
            </div>
            <div className="step">
              <div className="step__number">03</div>
              <h3>Let it learn and act</h3>
              <p>
                Your agent executes tasks, learns from outcomes, and self-improves &mdash; while
                policies and the vault keep everything safe.
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
            <h2>Agents that handle real work, safely</h2>
          </div>
          <div className="use-cases-grid">
            <div className="use-case-card">
              <h3>Crypto &amp; DeFi</h3>
              <ul>
                <li>
                  <CheckSvg /> Autonomous trading with spending limits
                </li>
                <li>
                  <CheckSvg /> DAO treasury management
                </li>
                <li>
                  <CheckSvg /> Multi-sig approval for high-value actions
                </li>
              </ul>
            </div>
            <div className="use-case-card">
              <h3>API Automation</h3>
              <ul>
                <li>
                  <CheckSvg /> Agent manages 20+ API keys securely
                </li>
                <li>
                  <CheckSvg /> Scoped access per project or task
                </li>
                <li>
                  <CheckSvg /> Self-improving workflows across services
                </li>
              </ul>
            </div>
            <div className="use-case-card">
              <h3>Teams &amp; Startups</h3>
              <ul>
                <li>
                  <CheckSvg /> Shared agent with approval flows
                </li>
                <li>
                  <CheckSvg /> Team credential management
                </li>
                <li>
                  <CheckSvg /> Agent gets better as your team uses it
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
            <h2>Self-improving agents, enterprise-grade security</h2>
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
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              </div>
              <h3>Self-Improving</h3>
              <p>Agents learn from every interaction and get better over time, automatically.</p>
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
                  <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
                  <path d="m9 12 2 2 4-4" />
                </svg>
              </div>
              <h3>Airgapped Vault</h3>
              <p>Secrets stored in hardware-backed HSM, completely separated from the agent.</p>
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
            <h2>Start free, scale when you&rsquo;re ready</h2>
          </div>
          <div className="pricing-grid" style={{ maxWidth: 700, margin: '0 auto' }}>
            <div className="pricing-card">
              <h3>Skills Only</h3>
              <div className="pricing-card__price">
                $10<span>/mo</span>
              </div>
              <div className="pricing-card__desc">For teams already running their own bot</div>
              <ul className="pricing-card__features">
                <li>
                  <CheckSvg /> Airgapped secret manager
                </li>
                <li>
                  <CheckSvg /> Policy engine &amp; spending limits
                </li>
                <li>
                  <CheckSvg /> Multi-party approval flows
                </li>
                <li>
                  <CheckSvg /> Skills file for any agent
                </li>
                <li>
                  <CheckSvg /> Bring your own bot &amp; LLM
                </li>
              </ul>
              <Link className="btn btn-secondary" to="/skills">
                Get the Skills File
              </Link>
            </div>
            <div className="pricing-card pricing-card--featured">
              <div className="pricing-card__badge">Most Popular</div>
              <h3>Hosted Agent</h3>
              <div className="pricing-card__price">
                $25<span>/mo</span>
              </div>
              <div className="pricing-card__desc">Per agent, billed monthly</div>
              <ul className="pricing-card__features">
                <li>
                  <CheckSvg /> Everything in Skills Only
                </li>
                <li>
                  <CheckSvg /> 7-day free trial
                </li>
                <li>
                  <CheckSvg /> 1 fully hosted, self-improving agent
                </li>
                <li>
                  <CheckSvg /> $25 free LLM credit to start
                </li>
                <li>
                  <CheckSvg /> Priority support
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
