import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

const STYLES = `
  :root{
    --bg: #0b0b0f;
    --bg2:#0a0a0f;
    --surface: rgba(255,255,255,.04);
    --surface2: rgba(255,255,255,.025);
    --border: rgba(255,255,255,.10);
    --border2: rgba(255,255,255,.07);
    --text: #f5f6f8;
    --muted:#a8b0bf;
    --muted2:#7f8898;
    --red:#ff3b3b;
    --blue:#3b82f6;
    --shadow: 0 30px 80px rgba(0,0,0,.55);
    --shadow2: 0 14px 40px rgba(0,0,0,.35);
    --radius: 16px;
    --radius2: 12px;
    --sans: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
    --mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  }

  .landing-page *{box-sizing:border-box}
  .landing-page{
    min-height:100vh;
    font-family: var(--sans);
    color: var(--text);
    background:
      radial-gradient(1200px 800px at var(--gx, 50%) var(--gy, 25%), rgba(59,130,246,.09), transparent 55%),
      radial-gradient(1200px 800px at var(--rx, 50%) var(--ry, 55%), rgba(255,59,59,.06), transparent 60%),
      radial-gradient(circle at 1px 1px, rgba(255,255,255,.07) 1px, transparent 1px),
      linear-gradient(180deg, var(--bg), var(--bg2));
    background-size: auto, auto, 26px 26px, auto;
    overflow-x:hidden;
  }

  @media (prefers-reduced-motion: reduce){
    .landing-page .reveal{animation:none; opacity:1; transform:none}
    .landing-page .panel, .landing-page .btn, .landing-page .copyBtn, .landing-page .navLinks a{transition:none}
  }

  @keyframes fadeUp{
    from{opacity:0; transform: translateY(10px)}
    to{opacity:1; transform: translateY(0)}
  }
  .landing-page .reveal{opacity:0; transform: translateY(10px); animation: fadeUp .65s ease-out forwards;}
  .landing-page .d1{animation-delay:.05s}
  .landing-page .d2{animation-delay:.12s}
  .landing-page .d3{animation-delay:.18s}
  .landing-page .d4{animation-delay:.26s}

  .landing-page a{color:inherit}
  .landing-page .container{max-width:1040px;margin:0 auto;padding:22px 20px 80px;}

  .landing-page .nav{display:flex;align-items:center;justify-content:space-between;gap:16px;margin:6px 0 40px;}
  .landing-page .brand{display:flex;align-items:center;gap:10px;text-decoration:none;}
  .landing-page .brandMark{
    width:auto;height:34px;border-radius:10px;
    display:flex;align-items:center;padding: 0 10px;
    background: rgba(255,255,255,.03);border:1px solid var(--border2);box-shadow: var(--shadow2);
  }
  .landing-page .brandLogo{height: 18px;width: auto;display:block;filter: invert(1);opacity: .9;}

  .landing-page .navLinks{display:flex;gap:10px;align-items:center}

  .landing-page .menuBtn{
    appearance:none;border:1px solid var(--border2);background: rgba(255,255,255,.03);
    color: rgba(245,246,248,.78);font-weight:650;font-size:13px;padding:9px 12px;
    border-radius:999px;cursor:pointer;
    transition: transform .18s ease, border-color .18s ease, color .18s ease, background .18s ease;
    text-decoration:none;display:inline-flex;align-items:center;justify-content:center;
  }
  .landing-page .menuBtn:hover{border-color: rgba(59,130,246,.5); color: rgba(245,246,248,.92); transform: translateY(-1px)}

  .landing-page .legacyLink{font-size: 12px;color: rgba(245,246,248,.55);text-decoration: none;border-bottom: 1px dashed rgba(255,255,255,.14);}
  .landing-page .legacyLink:hover{color: rgba(245,246,248,.8)}

  .landing-page h1{
    margin:0;font-family: var(--sans);font-size: clamp(28px, 3.0vw, 42px);
    line-height: 1.12;letter-spacing: -.02em;font-weight: 820;
  }

  .landing-page .lead{margin: 14px 0 0;max-width: 62ch;font-size: 16px;line-height: 1.6;color: var(--muted);}
  .landing-page .lead b{color: rgba(245,246,248,.92)}

  .landing-page .ctaRow{display:flex;gap:12px;flex-wrap:wrap;margin-top:18px;}
  .landing-page .btn{
    display:inline-flex;align-items:center;gap:10px;justify-content:center;
    text-decoration:none;border-radius:999px;padding: 10px 14px;font-weight: 750;
    letter-spacing: -.01em;border:1px solid var(--border);background: rgba(255,255,255,.04);
    box-shadow: var(--shadow2);color: rgba(245,246,248,.92);min-width: 190px;
    transition: border-color .18s ease, background .18s ease, box-shadow .18s ease;
  }
  .landing-page .btn:hover{border-color: rgba(59,130,246,.55); box-shadow: 0 16px 40px rgba(0,0,0,.32)}
  .landing-page .btn:active{transform: translateY(0px) scale(.99)}
  .landing-page .btn.primary{
    background: linear-gradient(180deg, rgba(59,130,246,.22), rgba(59,130,246,.10));
    border-color: rgba(59,130,246,.55);
  }

  .landing-page .micro{margin-top: 10px;font-size: 13px;color: var(--muted2);}

  .landing-page .sections{margin-top: 18px;display:flex;flex-direction:column;gap:18px;}
  .landing-page .panel{
    border-radius: var(--radius);border: 1px solid var(--border);background: rgba(255,255,255,.03);
    padding: 20px;box-shadow: 0 10px 30px rgba(0,0,0,.25);
    transition: border-color .18s ease, background .18s ease;
  }
  .landing-page .panel:hover{border-color: rgba(255,255,255,.12); background: rgba(255,255,255,.032)}

  .landing-page .panelHeader{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:10px;}
  .landing-page .panelTitle{margin:0;font-size: 18px;font-weight: 850;letter-spacing: -.02em;}
  .landing-page .chev{opacity:.55;margin-right:6px}

  .landing-page .iconBtn{
    border: 1px solid var(--border2);background: rgba(0,0,0,.12);border-radius: 10px;
    width: 36px;height: 36px;display:grid;place-items:center;cursor:pointer;
    transition: border-color .18s ease, background .18s ease;
  }
  .landing-page .iconBtn:hover{border-color: rgba(255,255,255,.18); background: rgba(0,0,0,.18)}

  .landing-page .termBody{
    font-family: var(--mono);font-size: 14px;color: rgba(245,246,248,.92);line-height: 1.7;
  }
  .landing-page .prompt{color: rgba(255,255,255,.55)}

  .landing-page .pill{
    display:inline-flex;align-items:center;gap:8px;padding: 8px 12px;border-radius: 999px;
    border: 1px solid rgba(255,255,255,.10);background: rgba(255,255,255,.03);
    color: rgba(245,246,248,.82);font-weight: 750;font-size: 13px;letter-spacing: -.01em;
  }

  .landing-page .footer{margin-top: 36px;display:flex;gap:14px;justify-content:center;flex-wrap:wrap;color: var(--muted2);font-size: 13px;}
  .landing-page .footer a{color: rgba(245,246,248,.72);text-decoration:none}
  .landing-page .footer a:hover{color: rgba(245,246,248,.92)}
`;

export default function Landing() {
  const containerRef = useRef<HTMLDivElement>(null);
  const cmdRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Parallax background effect
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;

    let targetX = 0, targetY = 0;
    let x = 0, y = 0;
    let raf: number | null = null;
    const start = performance.now();
    const el = containerRef.current;
    if (!el) return;

    const tick = (t: number) => {
      const k = 0.08;
      x += (targetX - x) * k;
      y += (targetY - y) * k;
      const s = (t - start) / 1000;
      const driftX = Math.sin(s / 12) * 0.35;
      const driftY = Math.cos(s / 15) * 0.35;
      const px = x + driftX;
      const py = y + driftY;
      el.style.setProperty('--gx', (44 + px * 7) + '%');
      el.style.setProperty('--gy', (22 + py * 7) + '%');
      el.style.setProperty('--rx', (56 - px * 7) + '%');
      el.style.setProperty('--ry', (60 - py * 7) + '%');
      raf = requestAnimationFrame(tick);
    };

    const onMove = (e: MouseEvent) => {
      targetX = ((e.clientX / window.innerWidth) * 2 - 1) * 0.65;
      targetY = ((e.clientY / window.innerHeight) * 2 - 1) * 0.65;
      if (!raf) raf = requestAnimationFrame(tick);
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('mouseleave', () => { targetX = 0; targetY = 0; }, { passive: true });
    raf = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('mousemove', onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const handleCopy = async () => {
    const text = cmdRef.current?.textContent?.replace('$', '').trim() || '';
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

  const [subscribed, setSubscribed] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  const handleSubscribe = () => {
    const val = emailRef.current?.value || '';
    if (!val || !val.includes('@')) return;
    setSubscribed(true);
    if (emailRef.current) emailRef.current.value = '';
  };

  return (
    <>
      <style>{STYLES}</style>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />

      <div className="landing-page" ref={containerRef}>
        <div className="container">

          <div className="nav">
            <a className="brand" href="/" aria-label="Vincent">
              <span className="brandMark" aria-hidden="true">
                <img src="/vincent-logo.svg" alt="" className="brandLogo" />
              </span>
            </a>
            <div className="navLinks">
              <Link className="menuBtn" to="/login">Human login</Link>
            </div>
          </div>

          <div className="hero" style={{ gridTemplateColumns: '1fr', textAlign: 'center', justifyItems: 'center', display: 'grid', paddingTop: 8, paddingBottom: 18 }}>
            <div style={{ maxWidth: 860 }}>
              <h1 className="reveal d1">Give your agent a key it can't leak.</h1>
              <p className="lead reveal d2" style={{ marginLeft: 'auto', marginRight: 'auto' }}>
                Agents execute with your secrets. They never see them.
              </p>

              <div className="ctaRow reveal d3" style={{ justifyContent: 'center', marginTop: 14, marginBottom: 16 }}>
                <a className="btn" href="/skill.md" style={{ minWidth: 260 }}><span>skill.md</span></a>
              </div>
            </div>
          </div>

          <div className="sections reveal d4" style={{ maxWidth: 860, marginLeft: 'auto', marginRight: 'auto' }}>

            {/* Quick Start */}
            <section id="quickstart" className="panel" style={{ padding: 0, overflow: 'hidden', borderRadius: 18, background: 'rgba(0,0,0,.28)', borderColor: 'rgba(255,255,255,.08)', maxWidth: 920, marginLeft: 'auto', marginRight: 'auto' }}>
              <div style={{ position: 'relative', padding: '12px 14px 0', borderBottom: '1px solid rgba(255,255,255,.06)', background: 'rgba(255,255,255,.01)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span style={{ width: 12, height: 12, borderRadius: 999, background: '#ff5f56', display: 'inline-block', opacity: 0.9 }} />
                    <span style={{ width: 12, height: 12, borderRadius: 999, background: '#ffbd2e', display: 'inline-block', opacity: 0.9 }} />
                    <span style={{ width: 12, height: 12, borderRadius: 999, background: '#27ca40', display: 'inline-block', opacity: 0.9 }} />
                  </div>
                  <div style={{ flex: 1 }} />
                  <button className="iconBtn" onClick={handleCopy} aria-label="Copy" title="Copy" style={{ borderRadius: 14, width: 40, height: 40 }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M9 9h10v10H9V9Z" stroke="rgba(245,246,248,.80)" strokeWidth="1.7" />
                      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" stroke="rgba(245,246,248,.55)" strokeWidth="1.7" />
                    </svg>
                  </button>
                </div>
              </div>
              <div style={{ padding: '10px 16px 14px' }}>
                <div className="termBody" ref={cmdRef} style={{ fontSize: 15, lineHeight: 1.75, background: 'transparent', padding: '8px 2px' }}>
                  <span className="prompt">$</span> curl -s https://heyvincent.ai/skill.md
                </div>
              </div>
            </section>

            {/* What it does */}
            <section id="what" className="panel" style={{ background: 'transparent', borderColor: 'transparent', boxShadow: 'none', padding: 0 }}>
              <div className="panelHeader" style={{ padding: '0 2px', marginBottom: 14 }}>
                <h2 className="panelTitle"><span className="chev">⟩</span>What it does</h2>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 14 }}>
                <div className="panel" style={{ padding: 18 }}>
                  <div style={{ fontWeight: 850 }}>Sealed Secrets</div>
                  <div className="micro">Secrets are encrypted with Lit and never exposed to the agent.</div>
                </div>
                <div className="panel" style={{ padding: 18 }}>
                  <div style={{ fontWeight: 850 }}>Smart Contract Wallet</div>
                  <div className="micro">Self-custodial EVM smart accounts for execution.</div>
                </div>
                <div className="panel" style={{ padding: 18 }}>
                  <div style={{ fontWeight: 850 }}>Guardrails</div>
                  <div className="micro">Limits, allowlists, selectors, approvals when needed.</div>
                </div>
                <div className="panel" style={{ padding: 18 }}>
                  <div style={{ fontWeight: 850 }}>Receipts</div>
                  <div className="micro">Audit logs for every attempt: allowed / denied / approved.</div>
                </div>
              </div>
            </section>

            {/* Connectors */}
            <section id="works" className="panel" style={{ background: 'transparent', borderColor: 'transparent', boxShadow: 'none', padding: 0 }}>
              <div className="panelHeader" style={{ padding: '0 2px', marginBottom: 14 }}>
                <h2 className="panelTitle"><span className="chev">⟩</span>Connectors</h2>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                <span className="pill">EVM smart contract wallet <span style={{ color: 'rgba(34,197,94,.9)' }}>● live</span></span>
              </div>
              <div className="micro" style={{ marginTop: 14, marginBottom: 8 }}>Coming soon</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                <span className="pill">Hyperliquid</span>
                <span className="pill">Polymarket</span>
                <span className="pill">Solana</span>
                <span className="pill">Bitcoin</span>
                <span className="pill">Binance</span>
                <span className="pill">Coinbase</span>
                <span className="pill">Alpaca</span>
              </div>
              <div className="micro" style={{ marginTop: 12 }}>Want a connector prioritized? Join Discord.</div>
            </section>

            {/* Stay in the loop */}
            <section id="loop" className="panel" style={{ padding: 22, textAlign: 'center' }}>
              <div style={{ fontWeight: 900, letterSpacing: '-.02em', fontSize: 18 }}>Stay in the loop</div>
              <div className="micro" style={{ marginTop: 10 }}>Get updates on new features and connectors.</div>
              <form style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 14 }} onSubmit={(e) => e.preventDefault()}>
                <input ref={emailRef} type="email" placeholder="you@email.com" style={{ width: 'min(420px, 88vw)', padding: '12px 14px', borderRadius: 999, border: '1px solid rgba(255,255,255,.10)', background: 'rgba(0,0,0,.18)', color: 'rgba(245,246,248,.9)', outline: 'none' }} />
                <button className="btn primary" onClick={handleSubscribe} style={{ minWidth: 160 }}>Subscribe</button>
              </form>
              {subscribed && <div className="micro" style={{ marginTop: 10, opacity: 0.85 }}>Saved. Thanks.</div>}
            </section>

            <div className="footer" style={{ marginTop: 24 }}>
              <a href="#" title="Discord">Discord</a>
              <a className="legacyLink" href="https://dashboard.heyvincent.ai" title="Legacy login">Legacy login</a>
            </div>

            <div className="footer" style={{ marginTop: 10, opacity: 0.9 }}>
              <a href="https://litprotocol.com" target="_blank" rel="noreferrer">From the team at Lit Protocol</a>
            </div>

          </div>
        </div>
      </div>
    </>
  );
}
