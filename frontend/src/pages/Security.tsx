import PageShell from '../components/PageShell';

const ShieldCheck = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
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
);
const Lock = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);
const AlertTriangle = () => (
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
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </svg>
);
const Eye = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
const ShieldSmall = () => (
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
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);
const XIcon = () => (
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
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);
const CheckSmall = () => (
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
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
const ChevDown = () => (
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
);

export default function Security() {
  return (
    <PageShell active="security">
      {/* Page Hero */}
      <section className="page-hero">
        <div className="container">
          <div className="section-label">Security</div>
          <h1>Your secrets never touch the AI</h1>
          <p>
            Vincent's two-layer architecture means credentials are physically separated from the AI
            runtime. Even a full compromise of the AI layer leaves your secrets untouched.
          </p>
        </div>
      </section>

      {/* Architecture Overview */}
      <section className="section section--alt">
        <div className="container">
          <div className="section-header">
            <div className="section-label">Architecture</div>
            <h2>Two layers, by design</h2>
            <p>
              The AI runtime and the secret vault are separate systems. The AI requests actions — it
              never holds credentials.
            </p>
          </div>

          <div className="security-split">
            <div className="security-points">
              <div className="security-point">
                <div className="card-icon">
                  <ShieldCheck />
                </div>
                <div>
                  <h3>Hardware-backed vault</h3>
                  <p>
                    Secrets are stored in a Lit Protocol-backed HSM. They never leave the secure
                    enclave — execution happens inside the vault.
                  </p>
                </div>
              </div>
              <div className="security-point">
                <div className="card-icon">
                  <Lock />
                </div>
                <div>
                  <h3>AI never sees raw credentials</h3>
                  <p>
                    The AI requests actions. Vincent evaluates policies and executes on its behalf.
                    The raw secret is never exposed to any external system.
                  </p>
                </div>
              </div>
              <div className="security-point">
                <div className="card-icon">
                  <AlertTriangle />
                </div>
                <div>
                  <h3>Breach-resistant architecture</h3>
                  <p>
                    Prompt injection, malicious plugins, runtime compromise — none of these give an
                    attacker access to your secrets. The separation is physical, not just logical.
                  </p>
                </div>
              </div>
              <div className="security-point">
                <div className="card-icon">
                  <Eye />
                </div>
                <div>
                  <h3>Complete audit trail</h3>
                  <p>
                    Every request and execution is logged. You see exactly what happened, when, and
                    why it was approved or denied.
                  </p>
                </div>
              </div>
            </div>

            <div>
              <div className="arch-diagram">
                <div className="arch-box arch-box--runtime">
                  <h4>AI Runtime</h4>
                  <p style={{ color: 'var(--text-muted)' }}>Conversation, skills, memory</p>
                  <div className="arch-tags">
                    <span className="arch-tag">Skills</span>
                    <span className="arch-tag">Memory</span>
                    <span className="arch-tag">Chat</span>
                  </div>
                  <p
                    style={{
                      marginTop: '0.75rem',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: 'var(--accent)',
                    }}
                  >
                    Never holds secrets
                  </p>
                </div>
                <div className="arch-arrow">
                  <div className="arch-arrow__line" />
                  <span className="arch-arrow__label">requests actions</span>
                  <ChevDown />
                </div>
                <div className="arch-box arch-box--mediator">
                  <h4>Vincent Mediator</h4>
                  <p style={{ color: 'var(--text-muted)' }}>Evaluates every request</p>
                  <div className="arch-tags">
                    <span className="arch-tag">Roles</span>
                    <span className="arch-tag">Policies</span>
                    <span className="arch-tag">Audit</span>
                  </div>
                </div>
                <div className="arch-arrow">
                  <div className="arch-arrow__line" />
                  <span className="arch-arrow__label">executes if authorized</span>
                  <ChevDown />
                </div>
                <div className="arch-box arch-box--vault">
                  <span className="arch-label">Airgapped</span>
                  <h4>Secret Vault</h4>
                  <p style={{ color: 'var(--text-muted)' }}>Credentials stored securely</p>
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

      {/* Threat Model */}
      <section className="section">
        <div className="container">
          <div className="section-header">
            <div className="section-label">Threat model</div>
            <h2>What happens if things go wrong?</h2>
            <p>
              We designed Vincent to be safe even when things fail. Here's what happens under
              different attack scenarios.
            </p>
          </div>

          <div className="threat-grid">
            <div className="threat-card">
              <div className="threat-card__attack">
                <AlertTriangle /> Prompt Injection
              </div>
              <div className="threat-card__result">
                <ShieldSmall />
                <span>
                  <strong>Secrets safe.</strong> The AI runtime never holds credentials. A prompt
                  injection can manipulate the AI's behavior, but it cannot extract secrets that
                  don't exist in its context.
                </span>
              </div>
            </div>
            <div className="threat-card">
              <div className="threat-card__attack">
                <AlertTriangle /> Malicious Plugin / Skill
              </div>
              <div className="threat-card__result">
                <ShieldSmall />
                <span>
                  <strong>Secrets safe.</strong> Skills and plugins run in the AI runtime layer.
                  They have no access path to the secret vault — it's on separate infrastructure
                  with no shared credentials.
                </span>
              </div>
            </div>
            <div className="threat-card">
              <div className="threat-card__attack">
                <AlertTriangle /> Full Runtime Compromise
              </div>
              <div className="threat-card__result">
                <ShieldSmall />
                <span>
                  <strong>Secrets safe.</strong> Root access to the AI runtime means root over
                  execution — NOT root over secrets. The vault is a separate system. An attacker
                  with full runtime access still can't reach the HSM.
                </span>
              </div>
            </div>
            <div className="threat-card">
              <div className="threat-card__attack">
                <AlertTriangle /> Admin Key Compromise
              </div>
              <div className="threat-card__result">
                <AlertTriangle />
                <span>
                  <strong>Revoke and rotate.</strong> This is the only real risk vector. If an admin
                  key is compromised, use the admin UI to revoke access and rotate credentials.
                  Multisig admin setups further mitigate this risk.
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Deep Dive */}
      <section className="section section--alt">
        <div className="container">
          <div className="section-header">
            <div className="section-label">Deep dive</div>
            <h2>How the security layer works</h2>
          </div>

          <div className="security-split">
            <div className="security-points">
              <div className="security-point">
                <div className="card-icon">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
                    <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
                    <line x1="6" x2="6.01" y1="6" y2="6" />
                    <line x1="6" x2="6.01" y1="18" y2="18" />
                  </svg>
                </div>
                <div>
                  <h3>Hardware Security Module (HSM)</h3>
                  <p>
                    Secrets are stored inside Lit Protocol's distributed HSM network. The HSM
                    performs cryptographic operations without ever exposing the raw key material.
                    This is the same technology used by banks and cloud providers.
                  </p>
                </div>
              </div>
              <div className="security-point">
                <div className="card-icon">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </div>
                <div>
                  <h3>Real-time policy evaluation</h3>
                  <p>
                    When the AI requests an action, the Vincent mediator checks: Who is the person?
                    What role does the AI have? What policies apply? Does this action fall within
                    limits? Only if everything passes does execution proceed.
                  </p>
                </div>
              </div>
              <div className="security-point">
                <div className="card-icon">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
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
                <div>
                  <h3>Immutable audit trail</h3>
                  <p>
                    Every request, policy evaluation result, and execution outcome is recorded. The
                    audit log captures the full decision chain: what was requested, which policies
                    were checked, and the final result.
                  </p>
                </div>
              </div>
              <div className="security-point">
                <div className="card-icon">
                  <AlertTriangle />
                </div>
                <div>
                  <h3>Admin controls</h3>
                  <p>
                    Admins can revoke access to any secret instantly, rotate credentials, and
                    configure emergency lockdown policies. Admin authority persists even if the AI
                    runtime is compromised.
                  </p>
                </div>
              </div>
            </div>

            <div>
              <div className="arch-diagram">
                <div className="arch-box" style={{ border: '1px solid var(--border)' }}>
                  <h4>1. User requests action via chat</h4>
                  <p style={{ color: 'var(--text-muted)' }}>"Send 0.5 ETH to alice.eth"</p>
                </div>
                <div className="arch-arrow">
                  <div className="arch-arrow__line" />
                  <ChevDown />
                </div>
                <div className="arch-box" style={{ border: '1px solid var(--border)' }}>
                  <h4>2. AI sends action request to Vincent</h4>
                  <p style={{ color: 'var(--text-muted)' }}>No secrets in the request</p>
                </div>
                <div className="arch-arrow">
                  <div className="arch-arrow__line" />
                  <ChevDown />
                </div>
                <div className="arch-box arch-box--mediator">
                  <h4>3. Vincent evaluates policies</h4>
                  <p style={{ color: 'var(--text-muted)' }}>Checks roles, limits, approvals</p>
                </div>
                <div className="arch-arrow">
                  <div className="arch-arrow__line" />
                  <span className="arch-arrow__label">if authorized</span>
                  <ChevDown />
                </div>
                <div className="arch-box arch-box--vault">
                  <span className="arch-label">Airgapped</span>
                  <h4>4. Vault executes action</h4>
                  <p style={{ color: 'var(--text-muted)' }}>Signs transaction inside HSM</p>
                </div>
                <div className="arch-arrow">
                  <div className="arch-arrow__line" />
                  <ChevDown />
                </div>
                <div className="arch-box" style={{ border: '1px solid #22c55e' }}>
                  <h4 style={{ color: '#22c55e' }}>5. Result returned to user</h4>
                  <p style={{ color: 'var(--text-muted)' }}>Transaction confirmed, logged</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust Model */}
      <section className="section">
        <div className="container">
          <div className="section-header">
            <div className="section-label">Trust model</div>
            <h2>The key insight</h2>
            <p style={{ fontSize: '1.25rem', color: 'var(--text)', fontWeight: 500 }}>
              Root access to the AI = root over execution,{' '}
              <em style={{ color: 'var(--accent)' }}>NOT</em> root over secrets.
            </p>
          </div>

          <div className="trust-compare">
            <div className="trust-box trust-box--old">
              <h3>Traditional approach</h3>
              <p>
                The AI holds your API keys and credentials directly. If the AI is compromised, your
                secrets are compromised.
              </p>
              <ul>
                <li>
                  <XIcon /> AI stores raw credentials in memory
                </li>
                <li>
                  <XIcon /> Prompt injection can exfiltrate secrets
                </li>
                <li>
                  <XIcon /> No policy enforcement
                </li>
                <li>
                  <XIcon /> Single point of failure
                </li>
              </ul>
            </div>
            <div className="trust-box trust-box--new">
              <h3>Vincent approach</h3>
              <p>
                The AI requests actions. Vincent evaluates policies and executes using the vault.
                The AI never sees raw credentials.
              </p>
              <ul>
                <li>
                  <CheckSmall /> Secrets in airgapped HSM vault
                </li>
                <li>
                  <CheckSmall /> AI compromise doesn't expose secrets
                </li>
                <li>
                  <CheckSmall /> Every action checked against policies
                </li>
                <li>
                  <CheckSmall /> Complete audit trail and admin controls
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
