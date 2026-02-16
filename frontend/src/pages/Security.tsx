import PageShell, { CheckSvg } from '../components/PageShell';

const ShieldCheck = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);
const Lock = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);
const AlertTriangle = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
    <path d="M12 9v4" /><path d="M12 17h.01" />
  </svg>
);
const Eye = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
const KeyIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="7.5" cy="15.5" r="5.5" /><path d="m21 2-9.3 9.3" /><path d="m18.7 2 2.3 2.3-3.5 3.5-2.3-2.3" />
  </svg>
);
const ShieldSmall = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);
const XIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6 6 18" /><path d="m6 6 12 12" />
  </svg>
);
const CheckSmall = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
const ChevDown = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
          <h1>Your agent acts. Your keys stay yours.</h1>
          <p>
            An airgapped vault managed by Lit Protocol's HSM, smart contract accounts for on-chain
            self-custody, and a policy engine that enforces your rules &mdash; even if the agent is compromised.
          </p>
        </div>
      </section>

      {/* Architecture Overview */}
      <section className="section section--alt">
        <div className="container">
          <div className="section-header">
            <div className="section-label">Architecture</div>
            <h2>Airgapped by design</h2>
            <p>
              The agent runtime and the self-custody vault are separate systems. The agent requests actions
              through the policy engine &mdash; it never holds or sees signing keys.
            </p>
          </div>

          <div className="security-split">
            <div className="security-points">
              <div className="security-point">
                <div className="card-icon"><ShieldCheck /></div>
                <div>
                  <h3>Lit Protocol HSM vault</h3>
                  <p>
                    Your agent's signing key is managed by Lit Protocol's distributed HSM network.
                    The key never leaves the secure enclave &mdash; signing happens inside the HSM.
                  </p>
                </div>
              </div>
              <div className="security-point">
                <div className="card-icon"><KeyIcon /></div>
                <div>
                  <h3>Smart contract self-custody</h3>
                  <p>
                    On-chain, smart contract accounts give you full self-custody at all times. You can
                    claim your keys and take direct control of your accounts whenever you want &mdash;
                    you're never locked in.
                  </p>
                </div>
              </div>
              <div className="security-point">
                <div className="card-icon"><Lock /></div>
                <div>
                  <h3>Agent never touches keys</h3>
                  <p>
                    The agent requests actions. The policy engine evaluates rules, and if approved, the
                    vault executes. The raw signing key is never exposed to the agent or any external system.
                  </p>
                </div>
              </div>
              <div className="security-point">
                <div className="card-icon"><Eye /></div>
                <div>
                  <h3>Complete audit trail</h3>
                  <p>
                    Every request, policy evaluation, and execution is logged. You see exactly what
                    happened, when, and why it was approved or denied.
                  </p>
                </div>
              </div>
            </div>

            <div>
              <div className="arch-diagram">
                <div className="arch-box arch-box--runtime">
                  <h4>Agent Runtime</h4>
                  <p style={{ color: 'var(--text-muted)' }}>Search, strategies, reasoning</p>
                  <div className="arch-tags">
                    <span className="arch-tag">Skills</span>
                    <span className="arch-tag">Search</span>
                    <span className="arch-tag">Alerts</span>
                  </div>
                  <p style={{ marginTop: '0.75rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent)' }}>
                    Never holds keys
                  </p>
                </div>
                <div className="arch-arrow">
                  <div className="arch-arrow__line" />
                  <span className="arch-arrow__label">requests actions</span>
                  <ChevDown />
                </div>
                <div className="arch-box arch-box--mediator">
                  <h4>Policy Engine</h4>
                  <p style={{ color: 'var(--text-muted)' }}>Evaluates every request</p>
                  <div className="arch-tags">
                    <span className="arch-tag">Limits</span>
                    <span className="arch-tag">Approvals</span>
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
                  <h4>Self-Custody Vault</h4>
                  <p style={{ color: 'var(--text-muted)' }}>Agent key in Lit HSM</p>
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

      {/* Self-Custody Deep Dive */}
      <section className="section">
        <div className="container">
          <div className="section-header">
            <div className="section-label">Self-custody</div>
            <h2>You own your accounts. Always.</h2>
            <p>
              Vincent uses smart contract accounts so you retain on-chain ownership at all times.
              The agent operates with delegated authority &mdash; you can revoke it or claim full control whenever you want.
            </p>
          </div>

          <div className="security-split">
            <div className="security-points">
              <div className="security-point">
                <div className="card-icon"><KeyIcon /></div>
                <div>
                  <h3>Smart contract accounts</h3>
                  <p>
                    Your on-chain accounts are smart contract wallets. The agent's signing key is an authorized
                    signer, but you are the owner. You can remove the agent's authority at any time through
                    the on-chain contract.
                  </p>
                </div>
              </div>
              <div className="security-point">
                <div className="card-icon"><ShieldCheck /></div>
                <div>
                  <h3>Claim your keys</h3>
                  <p>
                    If you ever want to leave Vincent, you can claim full control of your smart contract accounts.
                    Your assets, your keys, your choice. There's no lock-in, no withdrawal process, no waiting period.
                  </p>
                </div>
              </div>
              <div className="security-point">
                <div className="card-icon"><Lock /></div>
                <div>
                  <h3>On-chain verifiable</h3>
                  <p>
                    The ownership structure is on-chain and publicly verifiable. Anyone can audit the smart
                    contract to confirm that you are the owner and the agent key is just an authorized signer.
                  </p>
                </div>
              </div>
            </div>

            <div>
              <div className="arch-diagram">
                <div className="arch-box arch-box--vault">
                  <span className="arch-label">On-chain</span>
                  <h4>Smart Contract Account</h4>
                  <p style={{ color: 'var(--text-muted)' }}>You are the owner</p>
                </div>
                <div className="arch-arrow">
                  <div className="arch-arrow__line" />
                  <span className="arch-arrow__label">authorized signers</span>
                  <ChevDown />
                </div>
                <div className="diagram-flow-row">
                  <div className="arch-box arch-box--mediator" style={{ padding: '0.75rem' }}>
                    <h4 style={{ fontSize: '0.8125rem' }}>You</h4>
                    <span className="diagram-status diagram-status--green" style={{ fontSize: '0.6875rem' }}>owner</span>
                  </div>
                  <div className="arch-box arch-box--runtime" style={{ padding: '0.75rem' }}>
                    <h4 style={{ fontSize: '0.8125rem' }}>Agent Key</h4>
                    <span className="diagram-status diagram-status--orange" style={{ fontSize: '0.6875rem' }}>delegated</span>
                  </div>
                </div>
                <div className="arch-arrow">
                  <div className="arch-arrow__line" />
                  <span className="arch-arrow__label">agent key in HSM</span>
                  <ChevDown />
                </div>
                <div className="arch-box" style={{ border: '1px solid var(--border)' }}>
                  <h4 style={{ fontSize: '0.875rem' }}>Lit Protocol HSM</h4>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>Key never leaves enclave</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Threat Model */}
      <section className="section section--alt">
        <div className="container">
          <div className="section-header">
            <div className="section-label">Threat model</div>
            <h2>What happens if things go wrong?</h2>
            <p>
              Vincent is designed to be safe even when things fail. Here's what happens under
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
                  <strong>Keys safe.</strong> The agent runtime never holds signing keys. A prompt
                  injection can manipulate the agent's behavior, but it cannot extract keys that
                  don't exist in its context. The policy engine still enforces limits.
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
                  <strong>Keys safe.</strong> Skills and plugins run in the agent runtime layer.
                  They have no access path to the vault &mdash; it's on separate infrastructure
                  with no shared credentials. Actions still require policy approval.
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
                  <strong>Keys safe.</strong> Root access to the agent runtime means root over
                  execution &mdash; NOT root over signing keys. The vault is a separate system. An attacker
                  with full runtime access still can't reach the HSM or bypass smart contract ownership.
                </span>
              </div>
            </div>
            <div className="threat-card">
              <div className="threat-card__attack">
                <AlertTriangle /> Vincent Service Compromise
              </div>
              <div className="threat-card__result">
                <ShieldSmall />
                <span>
                  <strong>Self-custody protects you.</strong> Even if Vincent itself were compromised,
                  your smart contract accounts are on-chain and you are the owner. Revoke the agent's
                  delegated authority directly on-chain and take full control of your assets.
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="section">
        <div className="container">
          <div className="section-header">
            <div className="section-label">Deep dive</div>
            <h2>How the security layer works</h2>
          </div>

          <div className="security-split">
            <div className="security-points">
              <div className="security-point">
                <div className="card-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
                    <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
                    <line x1="6" x2="6.01" y1="6" y2="6" />
                    <line x1="6" x2="6.01" y1="18" y2="18" />
                  </svg>
                </div>
                <div>
                  <h3>Lit Protocol HSM network</h3>
                  <p>
                    Your agent's signing key is stored inside Lit Protocol's distributed HSM network.
                    The HSM performs cryptographic operations without ever exposing the raw key material.
                    This is the same technology used by banks and cloud providers.
                  </p>
                </div>
              </div>
              <div className="security-point">
                <div className="card-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </div>
                <div>
                  <h3>Policy engine evaluation</h3>
                  <p>
                    When the agent requests an action, the policy engine checks: What are the spending limits?
                    Does this action require multi-party approval? Is it within rate limits? Only if
                    everything passes does execution proceed.
                  </p>
                </div>
              </div>
              <div className="security-point">
                <div className="card-icon"><AlertTriangle /></div>
                <div>
                  <h3>Emergency controls</h3>
                  <p>
                    Revoke agent access instantly from the admin UI. Or go directly on-chain and remove
                    the agent's signing authority from your smart contract account. Admin authority persists
                    even if the agent runtime is compromised.
                  </p>
                </div>
              </div>
            </div>

            <div>
              <div className="arch-diagram">
                <div className="arch-box" style={{ border: '1px solid var(--border)' }}>
                  <h4>1. Alert fires or user requests action</h4>
                  <p style={{ color: 'var(--text-muted)' }}>"Sell 2.5 ETH on Base"</p>
                </div>
                <div className="arch-arrow">
                  <div className="arch-arrow__line" />
                  <ChevDown />
                </div>
                <div className="arch-box" style={{ border: '1px solid var(--border)' }}>
                  <h4>2. Agent reasons with search data</h4>
                  <p style={{ color: 'var(--text-muted)' }}>Web + X + on-chain sources confirmed</p>
                </div>
                <div className="arch-arrow">
                  <div className="arch-arrow__line" />
                  <ChevDown />
                </div>
                <div className="arch-box arch-box--mediator">
                  <h4>3. Policy engine evaluates</h4>
                  <p style={{ color: 'var(--text-muted)' }}>Checks limits, approvals, restrictions</p>
                </div>
                <div className="arch-arrow">
                  <div className="arch-arrow__line" />
                  <span className="arch-arrow__label">if authorized</span>
                  <ChevDown />
                </div>
                <div className="arch-box arch-box--vault">
                  <span className="arch-label">Airgapped</span>
                  <h4>4. Vault signs transaction</h4>
                  <p style={{ color: 'var(--text-muted)' }}>Lit HSM signs, smart account executes</p>
                </div>
                <div className="arch-arrow">
                  <div className="arch-arrow__line" />
                  <ChevDown />
                </div>
                <div className="arch-box" style={{ border: '1px solid #22c55e' }}>
                  <h4 style={{ color: '#22c55e' }}>5. Confirmed and logged</h4>
                  <p style={{ color: 'var(--text-muted)' }}>TX confirmed, full audit trail recorded</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust Model */}
      <section className="section section--alt">
        <div className="container">
          <div className="section-header">
            <div className="section-label">Trust model</div>
            <h2>The key insight</h2>
            <p style={{ fontSize: '1.25rem', color: 'var(--text)', fontWeight: 500 }}>
              Compromised agent = compromised execution,{' '}
              <em style={{ color: 'var(--accent)' }}>NOT</em> compromised keys.
            </p>
          </div>

          <div className="trust-compare">
            <div className="trust-box trust-box--old">
              <h3>Traditional bots</h3>
              <p>
                The bot holds your private keys directly. Secrets hardcoded or in .env files.
                If the bot is compromised, everything is lost.
              </p>
              <ul>
                <li><XIcon /> Private keys in .env or memory</li>
                <li><XIcon /> Prompt injection can exfiltrate keys</li>
                <li><XIcon /> No spending limits or policy enforcement</li>
                <li><XIcon /> No self-custody &mdash; bot controls everything</li>
                <li><XIcon /> One compromise = everything lost</li>
              </ul>
            </div>
            <div className="trust-box trust-box--new">
              <h3>Vincent</h3>
              <p>
                Agent key airgapped in Lit HSM. Smart contract accounts for on-chain self-custody.
                You own your accounts at all times.
              </p>
              <ul>
                <li><CheckSmall /> Agent key airgapped via Lit Protocol HSM</li>
                <li><CheckSmall /> Compromised agent can't access keys</li>
                <li><CheckSmall /> Policy engine enforces limits and approvals</li>
                <li><CheckSmall /> Smart contract self-custody &mdash; claim keys anytime</li>
                <li><CheckSmall /> Full audit trail and emergency revocation</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Multi-chain Security */}
      <section className="section">
        <div className="container">
          <div className="section-header">
            <div className="section-label">Cross-chain</div>
            <h2>One vault, every chain</h2>
            <p>
              The same airgapped vault and self-custody model works across all supported chains.
              EVM, Solana, Bitcoin, Sui &mdash; your agent transacts everywhere while your keys stay in one place.
            </p>
          </div>

          <div className="capabilities-grid" style={{ maxWidth: 800, margin: '0 auto' }}>
            <div className="capability-card">
              <div className="card-icon"><ShieldCheck /></div>
              <h3>Same security model</h3>
              <p>Every chain gets the same airgapped vault, policy engine, and audit trail. No chain-specific compromises.</p>
            </div>
            <div className="capability-card">
              <div className="card-icon"><KeyIcon /></div>
              <h3>Self-custody everywhere</h3>
              <p>Smart contract accounts on every supported chain. Claim your keys on any chain, at any time.</p>
            </div>
            <div className="capability-card">
              <div className="card-icon"><Lock /></div>
              <h3>Unified policies</h3>
              <p>One set of policies governs your agent across all chains. Spending limits, approval flows, and restrictions apply everywhere.</p>
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
