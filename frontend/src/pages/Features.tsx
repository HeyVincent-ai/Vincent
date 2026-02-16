import PageShell, { CheckSvg } from '../components/PageShell';

export default function Features() {
  return (
    <PageShell active="features">
      {/* Page Hero */}
      <section className="page-hero">
        <div className="container">
          <div className="section-label">Features</div>
          <h1>Everything your agent needs to put money to work</h1>
          <p>Search, strategies, alerts, smart LLM routing, a policy engine, and an airgapped self-custody vault &mdash; all in one skill.</p>
        </div>
      </section>

      {/* Feature 1: Self-Custody Vault */}
      <section className="section section--alt">
        <div className="container">
          <div className="feature-section">
            <div className="feature-section__content">
              <div className="section-label">Core security</div>
              <h2>Self-Custody Vault</h2>
              <p>
                Your agent's signing key is managed by Lit Protocol's HSM network, completely airgapped
                from the agent runtime. The AI requests actions but never touches the key.
              </p>
              <p>
                On-chain, smart contract accounts give you full self-custody at all times. You can claim
                your keys and take direct control of your accounts whenever you want &mdash; you're never locked in.
              </p>
              <ul>
                <li><CheckSvg /> Agent key managed via Lit Protocol HSM</li>
                <li><CheckSvg /> Airgapped from agent runtime &mdash; AI never touches keys</li>
                <li><CheckSvg /> Smart contract accounts for on-chain self-custody</li>
                <li><CheckSvg /> Claim your keys anytime &mdash; no lock-in</li>
              </ul>
            </div>
            <div className="feature-section__visual" style={{ background: 'var(--bg)' }}>
              <div className="arch-diagram" style={{ padding: '1.5rem' }}>
                <div className="arch-box arch-box--runtime">
                  <h4>Agent Runtime</h4>
                  <div className="arch-tags">
                    <span className="arch-tag">Skills</span>
                    <span className="arch-tag">Search</span>
                    <span className="arch-tag">Strategies</span>
                  </div>
                  <p style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Never holds keys
                  </p>
                </div>
                <div className="arch-arrow">
                  <div className="arch-arrow__line" />
                  <span className="arch-arrow__label">requests actions</span>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                </div>
                <div className="arch-box arch-box--mediator">
                  <h4>Policy Engine</h4>
                  <div className="arch-tags">
                    <span className="arch-tag">Limits</span>
                    <span className="arch-tag">Approvals</span>
                    <span className="arch-tag">Audit</span>
                  </div>
                </div>
                <div className="arch-arrow">
                  <div className="arch-arrow__line" />
                  <span className="arch-arrow__label">executes</span>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                </div>
                <div className="arch-box arch-box--vault">
                  <span className="arch-label">Airgapped</span>
                  <h4>Self-Custody Vault</h4>
                  <div className="arch-tags">
                    <span className="arch-tag">Lit HSM</span>
                    <span className="arch-tag">Smart Accounts</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature 2: Strategies & Alerts */}
      <section className="section">
        <div className="container">
          <div className="feature-section feature-section--reverse">
            <div className="feature-section__content">
              <div className="section-label">Monitoring</div>
              <h2>Strategies &amp; Alerts</h2>
              <p>
                Define custom monitoring strategies for your agent. Each strategy contains alerts that
                fire when specific conditions are met &mdash; price movements, sentiment shifts, on-chain
                events, or anything else you want to track.
              </p>
              <p>
                Unlike cron-based bots that burn LLM tokens on every tick, Vincent alerts only fire inference
                when a condition is actually met &mdash; dramatically more cost-efficient for monitoring tasks.
              </p>
              <ul>
                <li><CheckSvg /> Custom strategies with event-driven alerts</li>
                <li><CheckSvg /> Only fires LLM tokens when conditions are met</li>
                <li><CheckSvg /> Price, sentiment, on-chain, and custom triggers</li>
                <li><CheckSvg /> Toggle strategies on or off at any time</li>
              </ul>
            </div>
            <div className="feature-section__visual" style={{ background: 'var(--bg)', padding: '1.5rem', alignItems: 'stretch' }}>
              <div className="diagram-code">
                <div className="diagram-code__header">
                  <span className="diagram-log__dot diagram-log__dot--red" />
                  <span className="diagram-log__dot diagram-log__dot--yellow" />
                  <span className="diagram-log__dot diagram-log__dot--green" />
                  <span style={{ marginLeft: '0.5rem' }}>strategy.config</span>
                </div>
                <div className="diagram-code__line">
                  <span className="diagram-code__key">name:</span>{' '}
                  <span className="diagram-code__val">ETH Whale Watch</span>
                </div>
                <div className="diagram-code__line">
                  <span className="diagram-code__key">alerts:</span>
                </div>
                <div className="diagram-code__line">
                  {'  '}<span className="diagram-code__key">- trigger:</span>{' '}
                  <span className="diagram-code__val">eth_price_drop &gt; 3%</span>
                </div>
                <div className="diagram-code__line">
                  {'    '}<span className="diagram-code__key">sources:</span>{' '}
                  <span className="diagram-code__val">[on-chain, x, web]</span>
                </div>
                <div className="diagram-code__line">
                  {'    '}<span className="diagram-code__key">action:</span>{' '}
                  <span className="diagram-code__val">analyze_and_trade</span>
                </div>
                <div className="diagram-code__line">
                  {'  '}<span className="diagram-code__key">- trigger:</span>{' '}
                  <span className="diagram-code__val">whale_transfer &gt; 10k ETH</span>
                </div>
                <div className="diagram-code__line">
                  {'    '}<span className="diagram-code__key">action:</span>{' '}
                  <span className="diagram-code__val">alert_and_recommend</span>
                </div>
                <div className="diagram-code__line" style={{ marginTop: '0.5rem' }}>
                  <span className="diagram-code__key">status:</span>{' '}
                  <span className="diagram-code__check">&#10003; active</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature 3: Real-time Search */}
      <section className="section section--alt">
        <div className="container">
          <div className="feature-section">
            <div className="feature-section__content">
              <div className="section-label">Intelligence</div>
              <h2>Real-time Search</h2>
              <p>
                Your agent has access to real-time internet search for market data, news, and web-accessible
                information, plus full X (Twitter) API search for sentiment analysis, breaking news, and alpha discovery.
              </p>
              <p>
                Search results feed directly into your agent's reasoning, giving it the context it needs
                to make informed decisions before taking action.
              </p>
              <ul>
                <li><CheckSvg /> Live internet search for market data and news</li>
                <li><CheckSvg /> Full X (Twitter) API search</li>
                <li><CheckSvg /> On-chain data: prices, flows, funding rates</li>
                <li><CheckSvg /> Results feed directly into agent reasoning</li>
              </ul>
            </div>
            <div className="feature-section__visual" style={{ background: 'var(--bg)', padding: '1.5rem', alignItems: 'stretch' }}>
              <div className="diagram-log">
                <div className="diagram-log__header">
                  <span className="diagram-log__dot diagram-log__dot--red" />
                  <span className="diagram-log__dot diagram-log__dot--yellow" />
                  <span className="diagram-log__dot diagram-log__dot--green" />
                </div>
                <div className="diagram-log__entry">
                  <span className="diagram-log__time">09:14:01</span>
                  <span className="diagram-log__type diagram-log__type--request">SEARCH</span>
                  <span className="diagram-log__msg">web: &ldquo;ETH funding rate&rdquo;</span>
                </div>
                <div className="diagram-log__entry">
                  <span className="diagram-log__time">09:14:01</span>
                  <span className="diagram-log__type diagram-log__type--policy">X API</span>
                  <span className="diagram-log__msg">@whale_alert last 4h</span>
                </div>
                <div className="diagram-log__entry">
                  <span className="diagram-log__time">09:14:02</span>
                  <span className="diagram-log__type diagram-log__type--approved">ON-CHAIN</span>
                  <span className="diagram-log__msg">exchange inflows: +340%</span>
                </div>
                <div className="diagram-log__entry">
                  <span className="diagram-log__time">09:14:03</span>
                  <span className="diagram-log__type diagram-log__type--executed">REASONING</span>
                  <span className="diagram-log__msg">bearish signal confirmed &rarr; sell</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature 4: Smart LLM Routing */}
      <section className="section">
        <div className="container">
          <div className="feature-section feature-section--reverse">
            <div className="feature-section__content">
              <div className="section-label">Efficiency</div>
              <h2>Smart LLM Routing</h2>
              <p>
                Vincent intelligently routes requests across multiple LLM providers to minimize cost
                while maintaining quality. Simple monitoring tasks use cheaper, faster models.
                Complex reasoning and decision-making gets routed to more capable models automatically.
              </p>
              <ul>
                <li><CheckSvg /> Automatic routing across LLM providers</li>
                <li><CheckSvg /> Cheap models for simple monitoring tasks</li>
                <li><CheckSvg /> Best models for complex reasoning</li>
                <li><CheckSvg /> Dramatic cost savings vs. single-model setups</li>
              </ul>
            </div>
            <div className="feature-section__visual" style={{ background: 'var(--bg)' }}>
              <div className="arch-diagram" style={{ padding: '1.5rem' }}>
                <div className="arch-box arch-box--runtime">
                  <h4 style={{ fontSize: '0.875rem' }}>Agent Request</h4>
                  <p style={{ marginTop: '0.25rem', fontSize: '0.8125rem', color: 'var(--text)' }}>
                    Analyze ETH sentiment
                  </p>
                </div>
                <div className="arch-arrow">
                  <div className="arch-arrow__line" />
                  <span className="arch-arrow__label">routes to best model</span>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                </div>
                <div className="diagram-flow-row">
                  <div className="arch-box arch-box--mediator" style={{ padding: '0.75rem' }}>
                    <h4 style={{ fontSize: '0.75rem' }}>Monitoring</h4>
                    <span className="diagram-status diagram-status--dim">fast / cheap</span>
                  </div>
                  <div className="arch-box arch-box--vault" style={{ padding: '0.75rem' }}>
                    <h4 style={{ fontSize: '0.75rem' }}>Reasoning</h4>
                    <span className="diagram-status diagram-status--green">&#10003; selected</span>
                  </div>
                  <div className="arch-box arch-box--mediator" style={{ padding: '0.75rem' }}>
                    <h4 style={{ fontSize: '0.75rem' }}>Execution</h4>
                    <span className="diagram-status diagram-status--dim">reliable</span>
                  </div>
                </div>
                <div className="arch-arrow">
                  <div className="arch-arrow__line" />
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                </div>
                <div className="arch-box" style={{ border: '1px solid #22c55e' }}>
                  <h4 style={{ fontSize: '0.875rem' }}>
                    <span className="diagram-status diagram-status--green">&#10003; Routed</span>
                  </h4>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                    LLM cost: <span style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>$0.003</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature 5: Policy Engine */}
      <section className="section section--alt">
        <div className="container">
          <div className="feature-section">
            <div className="feature-section__content">
              <div className="section-label">Control</div>
              <h2>Policy Engine</h2>
              <p>
                Spending limits, action restrictions, and multi-party approval flows. Your agent only
                does what your policies allow. Policies compose &mdash; layer spending limits on top
                of action restrictions on top of frequency caps for precise risk control.
              </p>
              <p>
                Require n-of-m approval for high-stakes actions. Set up 2-of-3 signing for large
                withdrawals while letting the agent handle smaller transactions autonomously.
              </p>
              <ul>
                <li><CheckSvg /> Spending limits (e.g., max $500/day)</li>
                <li><CheckSvg /> Action restrictions (specific operations only)</li>
                <li><CheckSvg /> Multi-party approval (n-of-m signing)</li>
                <li><CheckSvg /> Composable &mdash; layer policies for precise control</li>
              </ul>
            </div>
            <div className="feature-section__visual" style={{ background: 'var(--bg)' }}>
              <div className="arch-diagram" style={{ padding: '1.5rem' }}>
                <div className="arch-box arch-box--mediator">
                  <div className="arch-tags" style={{ marginTop: 0 }}>
                    <span className="arch-tag">Spending Limit</span>
                  </div>
                  <p style={{ marginTop: '0.375rem', fontSize: '0.8125rem', color: 'var(--text)' }}>
                    Max <span style={{ color: 'var(--accent)', fontWeight: 700 }}>$500</span>/day
                  </p>
                </div>
                <div className="diagram-compose">+</div>
                <div className="arch-box arch-box--mediator">
                  <div className="arch-tags" style={{ marginTop: 0 }}>
                    <span className="arch-tag">Action Restriction</span>
                  </div>
                  <p style={{ marginTop: '0.375rem', fontSize: '0.8125rem', color: 'var(--text)' }}>
                    <span style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>swap</span>
                    {' '}<span style={{ color: 'var(--text-dim)' }}>and</span>{' '}
                    <span style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>transfer</span>
                    {' '}<span style={{ color: 'var(--text-dim)' }}>only</span>
                  </p>
                </div>
                <div className="diagram-compose">+</div>
                <div className="arch-box arch-box--mediator">
                  <div className="arch-tags" style={{ marginTop: 0 }}>
                    <span className="arch-tag">Multi-Party Approval</span>
                  </div>
                  <p style={{ marginTop: '0.375rem', fontSize: '0.8125rem', color: 'var(--text)' }}>
                    <span style={{ color: 'var(--accent)', fontWeight: 700 }}>2-of-3</span> for &gt;$1,000
                  </p>
                </div>
                <div className="arch-arrow">
                  <div className="arch-arrow__line" />
                  <span className="arch-arrow__label">combined</span>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                </div>
                <div className="arch-box arch-box--vault">
                  <span className="arch-label">Active Policy</span>
                  <h4 style={{ fontSize: '0.875rem' }}>
                    <span className="diagram-status diagram-status--green">&#10003; All rules enforced</span>
                  </h4>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature 6: Works With Any Agent */}
      <section className="section">
        <div className="container">
          <div className="feature-section feature-section--reverse">
            <div className="feature-section__content">
              <div className="section-label">Flexibility</div>
              <h2>Works With Any Agent</h2>
              <p>
                Add the Vincent skill to any existing agent via the skills repo, or let us deploy a
                fully hosted agent for you. Either way you get the same vault, policies, and audit trail.
              </p>
              <p>
                Vincent is agent-agnostic. The security layer doesn't care what AI is making the
                requests &mdash; it evaluates policies the same way regardless.
              </p>
              <ul>
                <li><CheckSvg /> Add the skill to any agent via the skills repo</li>
                <li><CheckSvg /> Or deploy a fully hosted agent</li>
                <li><CheckSvg /> Same vault, same policies, same security</li>
                <li><CheckSvg /> No lock-in &mdash; switch agents without losing config</li>
              </ul>
            </div>
            <div className="feature-section__visual" style={{ background: 'var(--bg)' }}>
              <div className="arch-diagram" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', gap: '0.75rem', width: '100%' }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div className="arch-box arch-box--runtime" style={{ padding: '1rem' }}>
                      <h4 style={{ fontSize: '0.8125rem' }}>Your Bot</h4>
                      <div className="arch-tags">
                        <span className="arch-tag">any framework</span>
                      </div>
                    </div>
                    <div className="arch-box arch-box--runtime" style={{ padding: '1rem' }}>
                      <h4 style={{ fontSize: '0.8125rem' }}>Hosted Agent</h4>
                      <div className="arch-tags">
                        <span className="arch-tag">OpenClaw</span>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <div className="arch-arrow arch-arrow--horizontal">
                      <div className="arch-arrow__line" />
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                    </div>
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '0.75rem' }}>
                    <div className="arch-box arch-box--mediator" style={{ padding: '1rem' }}>
                      <h4 style={{ fontSize: '0.8125rem' }}>Vincent API</h4>
                      <div className="arch-tags">
                        <span className="arch-tag">skills repo</span>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <div className="arch-arrow arch-arrow--horizontal">
                      <div className="arch-arrow__line" />
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                    </div>
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <div className="arch-box arch-box--vault" style={{ padding: '1rem' }}>
                      <span className="arch-label">Airgapped</span>
                      <h4 style={{ fontSize: '0.8125rem' }}>Vault</h4>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature 7: Full Audit Trail */}
      <section className="section section--alt">
        <div className="container">
          <div className="feature-section">
            <div className="feature-section__content">
              <div className="section-label">Visibility</div>
              <h2>Full Audit Trail</h2>
              <p>
                Every action request, policy evaluation, and execution is logged. See exactly who
                requested what, which policies were evaluated, whether it was approved or denied,
                and the result of execution.
              </p>
              <ul>
                <li><CheckSvg /> Every request and execution logged</li>
                <li><CheckSvg /> Policy evaluation results visible</li>
                <li><CheckSvg /> Approval/denial reasons recorded</li>
                <li><CheckSvg /> Configurable retention (7 days to 1 year)</li>
              </ul>
            </div>
            <div className="feature-section__visual" style={{ background: 'var(--bg)', padding: '1.5rem', alignItems: 'stretch' }}>
              <div className="diagram-log">
                <div className="diagram-log__header">
                  <span className="diagram-log__dot diagram-log__dot--red" />
                  <span className="diagram-log__dot diagram-log__dot--yellow" />
                  <span className="diagram-log__dot diagram-log__dot--green" />
                </div>
                <div className="diagram-log__entry">
                  <span className="diagram-log__time">14:23:01</span>
                  <span className="diagram-log__type diagram-log__type--request">ALERT</span>
                  <span className="diagram-log__msg">ETH whale strategy fired</span>
                </div>
                <div className="diagram-log__entry">
                  <span className="diagram-log__time">14:23:02</span>
                  <span className="diagram-log__type diagram-log__type--request">SEARCH</span>
                  <span className="diagram-log__msg">web + X: 3 sources confirmed</span>
                </div>
                <div className="diagram-log__entry">
                  <span className="diagram-log__time">14:23:03</span>
                  <span className="diagram-log__type diagram-log__type--policy">POLICY</span>
                  <span className="diagram-log__msg">spending-limit: &#10003; rate-limit: &#10003;</span>
                </div>
                <div className="diagram-log__entry">
                  <span className="diagram-log__time">14:23:03</span>
                  <span className="diagram-log__type diagram-log__type--approved">APPROVED</span>
                  <span className="diagram-log__msg">auto (within limits)</span>
                </div>
                <div className="diagram-log__entry">
                  <span className="diagram-log__time">14:23:04</span>
                  <span className="diagram-log__type diagram-log__type--executed">EXECUTED</span>
                  <span className="diagram-log__msg">sold 2.5 ETH &rarr; tx: 0x8f2a...c2d1</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature 8: Multi-chain */}
      <section className="section">
        <div className="container">
          <div className="feature-section feature-section--reverse">
            <div className="feature-section__content">
              <div className="section-label">Cross-chain</div>
              <h2>Every Chain, One Vault</h2>
              <p>
                Vincent supports all chains. EVM, Solana, Bitcoin, Sui, and more &mdash; if it has
                a blockchain, Vincent can work with it. Your agent transacts across chains while
                your keys stay in a single airgapped vault.
              </p>
              <ul>
                <li><CheckSvg /> Ethereum, Base, Arbitrum, Polygon, and all EVM chains</li>
                <li><CheckSvg /> Solana</li>
                <li><CheckSvg /> Bitcoin</li>
                <li><CheckSvg /> Sui and more</li>
              </ul>
            </div>
            <div className="feature-section__visual" style={{ background: 'var(--bg)' }}>
              <div className="arch-diagram" style={{ padding: '1.5rem' }}>
                <div className="arch-box arch-box--vault">
                  <span className="arch-label">Single Vault</span>
                  <h4 style={{ fontSize: '0.875rem' }}>Airgapped Agent Key</h4>
                </div>
                <div className="arch-arrow">
                  <div className="arch-arrow__line" />
                  <span className="arch-arrow__label">signs for any chain</span>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                </div>
                <div className="diagram-flow-row">
                  <div className="arch-box arch-box--mediator" style={{ padding: '0.75rem' }}>
                    <h4 style={{ fontSize: '0.75rem' }}>Ethereum</h4>
                    <span className="diagram-status diagram-status--green">&#10003;</span>
                  </div>
                  <div className="arch-box arch-box--mediator" style={{ padding: '0.75rem' }}>
                    <h4 style={{ fontSize: '0.75rem' }}>Solana</h4>
                    <span className="diagram-status diagram-status--green">&#10003;</span>
                  </div>
                  <div className="arch-box arch-box--mediator" style={{ padding: '0.75rem' }}>
                    <h4 style={{ fontSize: '0.75rem' }}>Bitcoin</h4>
                    <span className="diagram-status diagram-status--green">&#10003;</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature 9: Advanced Mode */}
      <section className="section section--alt">
        <div className="container">
          <div className="feature-section">
            <div className="feature-section__content">
              <div className="section-label">Power users</div>
              <h2>Advanced Mode</h2>
              <p>
                Flip on Advanced Mode and get full access to the underlying OpenClaw runtime
                powering your hosted agent. Install community skills, customize the agent's behavior,
                connect new data sources, and extend its capabilities &mdash; all while keeping Vincent's
                airgapped vault in place.
              </p>
              <ul>
                <li><CheckSvg /> Full access to the OpenClaw runtime</li>
                <li><CheckSvg /> Install community skills and connectors</li>
                <li><CheckSvg /> Customize agent behavior and memory</li>
                <li><CheckSvg /> Vault stays airgapped &mdash; Advanced Mode never compromises security</li>
              </ul>
            </div>
            <div className="feature-section__visual" style={{ background: 'var(--bg)', padding: '1.5rem', alignItems: 'stretch' }}>
              <div className="diagram-code">
                <div className="diagram-code__header">
                  <span className="diagram-log__dot diagram-log__dot--red" />
                  <span className="diagram-log__dot diagram-log__dot--yellow" />
                  <span className="diagram-log__dot diagram-log__dot--green" />
                  <span style={{ marginLeft: '0.5rem' }}>vincent.config</span>
                </div>
                <div className="diagram-code__line">
                  <span className="diagram-code__key">runtime:</span>{' '}
                  <span className="diagram-code__val">openclaw</span>
                </div>
                <div className="diagram-code__line">
                  <span className="diagram-code__key">skills:</span>
                </div>
                <div className="diagram-code__line">
                  {'  '}<span className="diagram-code__val">- polymarket</span>
                </div>
                <div className="diagram-code__line">
                  {'  '}<span className="diagram-code__val">- defi-swap</span>
                </div>
                <div className="diagram-code__line">
                  {'  '}<span className="diagram-code__val">- custom/my-skill</span>{' '}
                  <span className="diagram-code__comment"># your own</span>
                </div>
                <div className="diagram-code__line">
                  <span className="diagram-code__key">search:</span>{' '}
                  <span className="diagram-code__val">[web, x, on-chain]</span>
                </div>
                <div className="diagram-code__line">
                  <span className="diagram-code__key">vault:</span>{' '}
                  <span className="diagram-code__val">airgapped</span>{' '}
                  <span className="diagram-code__check">&#10003;</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
