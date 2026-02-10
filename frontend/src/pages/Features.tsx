import PageShell, { CheckSvg } from '../components/PageShell';

export default function Features() {
  return (
    <PageShell active="features">
      {/* Page Hero */}
      <section className="page-hero">
        <div className="container">
          <div className="section-label">Features</div>
          <h1>Built for safe AI execution</h1>
          <p>Everything you need to let AI act on your behalf — without risking your secrets.</p>
        </div>
      </section>

      {/* Feature 1: Airgapped Secret Manager */}
      <section className="section section--alt">
        <div className="container">
          <div className="feature-section">
            <div className="feature-section__content">
              <div className="section-label">Core security</div>
              <h2>Airgapped Secret Manager</h2>
              <p>
                Your credentials are stored in a hardware-backed vault powered by Lit Protocol's HSM
                infrastructure. The secret manager is completely separated from the AI runtime —
                they run on different infrastructure with no shared access.
              </p>
              <p>
                Even if the AI runtime is fully compromised through prompt injection, malicious
                plugins, or a runtime breach, your secrets remain untouched.
              </p>
              <ul>
                <li>
                  <CheckSvg /> Hardware-backed HSM vault (Lit Protocol)
                </li>
                <li>
                  <CheckSvg /> Physically separated from AI runtime
                </li>
                <li>
                  <CheckSvg /> AI never sees raw credentials
                </li>
              </ul>
            </div>
            <div className="feature-section__visual" style={{ background: 'var(--bg)' }}>
              <div className="arch-diagram" style={{ padding: '1.5rem' }}>
                <div className="arch-box arch-box--runtime">
                  <h4>AI Runtime</h4>
                  <div className="arch-tags">
                    <span className="arch-tag">Skills</span>
                    <span className="arch-tag">Memory</span>
                    <span className="arch-tag">Chat</span>
                  </div>
                  <p
                    style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}
                  >
                    Never holds secrets
                  </p>
                </div>
                <div className="arch-arrow">
                  <div className="arch-arrow__line" />
                  <span className="arch-arrow__label">requests actions</span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </div>
                <div className="arch-box arch-box--mediator">
                  <h4>Vincent Mediator</h4>
                  <div className="arch-tags">
                    <span className="arch-tag">Roles</span>
                    <span className="arch-tag">Policies</span>
                    <span className="arch-tag">Audit</span>
                  </div>
                </div>
                <div className="arch-arrow">
                  <div className="arch-arrow__line" />
                  <span className="arch-arrow__label">executes</span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </div>
                <div className="arch-box arch-box--vault">
                  <span className="arch-label">Airgapped</span>
                  <h4>Secret Vault</h4>
                  <div className="arch-tags">
                    <span className="arch-tag">HSM-backed</span>
                    <span className="arch-tag">Lit Protocol</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature 2: Granular Policies */}
      <section className="section">
        <div className="container">
          <div className="feature-section feature-section--reverse">
            <div className="feature-section__content">
              <div className="section-label">Control</div>
              <h2>Granular Policies</h2>
              <p>
                Define exactly what each person and AI agent can do with each secret. Policies
                compose — layer spending limits on top of action restrictions on top of frequency
                caps for precise risk control.
              </p>
              <p>
                Policies are evaluated in real time by the Vincent mediator. Every request is
                checked against the full policy stack before any action is executed.
              </p>
              <ul>
                <li>
                  <CheckSvg /> Spending limits (e.g., max $500/day)
                </li>
                <li>
                  <CheckSvg /> Action restrictions (specific operations only)
                </li>
                <li>
                  <CheckSvg /> Frequency caps and rate limiting
                </li>
                <li>
                  <CheckSvg /> Composable — layer policies for precise control
                </li>
              </ul>
            </div>
            <div className="feature-section__visual">Policy Configuration</div>
          </div>
        </div>
      </section>

      {/* Feature 3: Multi-Party Authority */}
      <section className="section section--alt">
        <div className="container">
          <div className="feature-section">
            <div className="feature-section__content">
              <div className="section-label">Collaboration</div>
              <h2>Multi-Party Authority</h2>
              <p>
                Require n-of-m approval for high-stakes actions. Set up 2-of-3 signing for large
                withdrawals while letting the AI handle smaller transactions autonomously. Perfect
                for groups managing shared resources.
              </p>
              <p>
                Approval flows work across chat platforms — team members approve or deny directly in
                Telegram, with full context on what's being requested and why.
              </p>
              <ul>
                <li>
                  <CheckSvg /> n-of-m approval (e.g., 2-of-3 must sign)
                </li>
                <li>
                  <CheckSvg /> Threshold-based rules per action type
                </li>
                <li>
                  <CheckSvg /> In-chat approval workflows
                </li>
                <li>
                  <CheckSvg /> Pooled control for shared resources
                </li>
              </ul>
            </div>
            <div className="feature-section__visual">Approval Flow Diagram</div>
          </div>
        </div>
      </section>

      {/* Feature 4: Role-Based Access */}
      <section className="section">
        <div className="container">
          <div className="feature-section feature-section--reverse">
            <div className="feature-section__content">
              <div className="section-label">Access control</div>
              <h2>Role-Based Access</h2>
              <p>
                Four role levels give you precise control over who can do what with each secret.
                Roles are assigned per-secret, per-person, and per-agent — so you can give your AI
                read access to one secret and full execute on another.
              </p>
              <ul>
                <li>
                  <CheckSvg /> <strong>Read</strong> — View balances, status, history
                </li>
                <li>
                  <CheckSvg /> <strong>Scoped Execute</strong> — Act within defined limits
                </li>
                <li>
                  <CheckSvg /> <strong>Full Execute</strong> — Act freely on this secret
                </li>
                <li>
                  <CheckSvg /> <strong>Admin</strong> — Full control, grant/revoke roles
                </li>
              </ul>
            </div>
            <div className="feature-section__visual">Role Matrix Visualization</div>
          </div>
        </div>
      </section>

      {/* Feature 5: Works With Any Agent */}
      <section className="section section--alt">
        <div className="container">
          <div className="feature-section">
            <div className="feature-section__content">
              <div className="section-label">Flexibility</div>
              <h2>Works With Any Agent</h2>
              <p>
                Use our hosted Clawd bot on Telegram for a complete out-of-the-box experience, or
                give your existing AI agent the Vincent skills.md file. Either way, the same
                airgapped vault protects your secrets with the same policies and audit trail.
              </p>
              <p>
                Vincent is agent-agnostic. The security layer doesn't care what AI is making the
                requests — it evaluates policies the same way regardless.
              </p>
              <ul>
                <li>
                  <CheckSvg /> Hosted Clawd bot on Telegram (Slack, Discord coming soon)
                </li>
                <li>
                  <CheckSvg /> Bring-your-own-agent via skills.md
                </li>
                <li>
                  <CheckSvg /> Same vault, same policies, same security
                </li>
                <li>
                  <CheckSvg /> No lock-in — switch agents without losing config
                </li>
              </ul>
            </div>
            <div className="feature-section__visual">Integration Diagram</div>
          </div>
        </div>
      </section>

      {/* Feature 6: Full Audit Trail */}
      <section className="section">
        <div className="container">
          <div className="feature-section feature-section--reverse">
            <div className="feature-section__content">
              <div className="section-label">Visibility</div>
              <h2>Full Audit Trail</h2>
              <p>
                Every action request, policy evaluation, and execution is logged. See exactly who
                requested what, which policies were evaluated, whether it was approved or denied,
                and the result of execution.
              </p>
              <p>
                The audit trail is your complete record of AI activity. Use it for compliance,
                debugging, or simply keeping track of what your AI is doing on your behalf.
              </p>
              <ul>
                <li>
                  <CheckSvg /> Every request and execution logged
                </li>
                <li>
                  <CheckSvg /> Policy evaluation results visible
                </li>
                <li>
                  <CheckSvg /> Approval/denial reasons recorded
                </li>
                <li>
                  <CheckSvg /> Configurable retention (7 days to 1 year)
                </li>
              </ul>
            </div>
            <div className="feature-section__visual">Audit Log</div>
          </div>
        </div>
      </section>

      {/* Feature 7: Advanced Mode */}
      <section className="section section--alt">
        <div className="container">
          <div className="feature-section">
            <div className="feature-section__content">
              <div className="section-label">Power users</div>
              <h2>Advanced Mode</h2>
              <p>
                Flip on Advanced Mode and get full access to the underlying OpenClaw runtime
                powering your hosted bot. Install community skills, customize the bot's behavior,
                connect new data sources, and extend its capabilities — all while keeping Vincent's
                airgapped secret management in place.
              </p>
              <p>
                Advanced Mode gives you the best of both worlds: the convenience of a hosted bot
                with the extensibility of an open runtime.
              </p>
              <ul>
                <li>
                  <CheckSvg /> Full access to the OpenClawd runtime
                </li>
                <li>
                  <CheckSvg /> Install community skills and connectors
                </li>
                <li>
                  <CheckSvg /> Customize bot behavior and memory
                </li>
                <li>
                  <CheckSvg /> Secrets stay airgapped — Advanced Mode never compromises security
                </li>
              </ul>
            </div>
            <div className="feature-section__visual">Advanced Mode Interface</div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
