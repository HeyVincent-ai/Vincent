import { useEffect, useRef } from 'react';

const THESIS_STYLES = `
  .thesis-page {
    color-scheme: dark;
    --bg: #0d1117;
    --bg-alt: #0a0e13;
    --surface: #161b22;
    --surface-hover: #1c2129;
    --border: #30363d;
    --border-light: #21262d;
    --text: #e6edf3;
    --text-muted: #8b949e;
    --text-dim: #484f58;
    --accent: #f97316;
    --accent-hover: #ea580c;
    --accent-light: #fed7aa;
    --accent-glow: rgba(249, 115, 22, 0.15);
    --accent-glow-strong: rgba(249, 115, 22, 0.3);
    --success: #22c55e;
    --warning: #eab308;
    --destructive: #ef4444;
    --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    --font-mono: 'SF Mono', 'Fira Code', Menlo, Consolas, monospace;
    --max-width: 1200px;
    --wizard-width: 720px;
    --radius: 12px;
    --radius-sm: 8px;
    --radius-lg: 16px;

    font-family: var(--font-sans);
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    background-image: radial-gradient(circle, var(--border-light) 1px, transparent 1px);
    background-size: 24px 24px;
    position: relative;
  }

  .thesis-page *, .thesis-page *::before, .thesis-page *::after { box-sizing: border-box; margin: 0; padding: 0; }

  .thesis-page::before {
    content: '';
    position: fixed;
    top: 0; left: 0; right: 0;
    height: 300px;
    background: radial-gradient(ellipse 60% 50% at 50% 0%, rgba(249, 115, 22, 0.06) 0%, transparent 100%);
    pointer-events: none;
    z-index: 0;
  }

  .thesis-page ::selection { background: rgba(249, 115, 22, 0.3); color: var(--text); }

  .thesis-page a { color: inherit; text-decoration: none; }
  .thesis-page button { font: inherit; cursor: pointer; border: none; background: none; color: inherit; }
  .thesis-page input, .thesis-page select, .thesis-page textarea { font: inherit; }

  .thesis-page :focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .thesis-page button:focus-visible, .thesis-page a:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    border-radius: var(--radius-sm);
  }

  .thesis-page .app {
    max-width: var(--max-width);
    margin: 0 auto;
    padding: 0 24px 80px;
  }

  .thesis-page.tp-landing .app {
    max-width: var(--max-width);
    padding: 0;
  }

  .thesis-page.tp-landing .wizard-header { display: none; }

  .thesis-page .wizard-header {
    padding: 24px 0 0;
    max-width: var(--wizard-width);
    margin: 0 auto 32px;
  }

  .thesis-page .wizard-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 24px;
  }

  .thesis-page .logo {
    display: flex;
    align-items: center;
    gap: 10px;
    font-weight: 700;
    font-size: 1.125rem;
    letter-spacing: -0.02em;
  }

  .thesis-page .logo-mark {
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    flex-shrink: 0;
  }

  .thesis-page .logo-mark svg { width: 100%; height: 100%; }

  .thesis-page .step-indicator { display: flex; gap: 8px; align-items: center; }

  .thesis-page .step-dot { display: flex; align-items: center; gap: 6px; }

  .thesis-page .step-dot-circle {
    width: 28px; height: 28px; border-radius: 50%;
    border: 2px solid var(--border);
    display: grid; place-items: center;
    font-size: 0.7rem; font-weight: 600; color: var(--text-dim);
    transition: all 0.2s; flex-shrink: 0;
  }

  .thesis-page .step-dot.active .step-dot-circle { border-color: var(--accent); background: var(--accent); color: #fff; }
  .thesis-page .step-dot.completed .step-dot-circle { border-color: var(--accent); background: var(--accent-glow); color: var(--accent); }

  .thesis-page .step-dot-label { font-size: 0.8rem; color: var(--text-dim); font-weight: 500; transition: color 0.2s; white-space: nowrap; }
  .thesis-page .step-dot.active .step-dot-label { color: var(--text); }
  .thesis-page .step-dot.completed .step-dot-label { color: var(--text-muted); }

  .thesis-page .step-connector { width: 24px; height: 2px; background: var(--border); border-radius: 999px; flex-shrink: 0; }
  .thesis-page .step-connector.completed { background: var(--accent); }

  .thesis-page .landing-nav {
    display: flex; justify-content: space-between; align-items: center;
    padding: 0 2rem; height: 72px; border-bottom: 1px solid var(--border);
    position: sticky; top: 0; background: rgba(13, 17, 23, 0.85);
    backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); z-index: 100;
  }

  .thesis-page .landing-logo {
    font-size: 1.25rem; font-weight: 700; color: var(--text);
    display: flex; align-items: center; gap: 0.5rem; letter-spacing: -0.02em;
  }

  .thesis-page .landing-logo-icon { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .thesis-page .landing-logo-icon svg { width: 100%; height: 100%; }

  .thesis-page .landing-nav-links { display: flex; gap: 2rem; align-items: center; }
  .thesis-page .landing-nav-link { color: var(--text-muted); font-size: 0.9375rem; font-weight: 500; transition: color 0.2s; }
  .thesis-page .landing-nav-link:hover { color: var(--text); }

  .thesis-page .btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem;
    font-weight: 500; border-radius: var(--radius-sm); transition: all 0.15s ease; white-space: nowrap;
  }

  .thesis-page .btn-primary { background: var(--accent); color: #fff; padding: 0.625rem 1.25rem; font-size: 0.875rem; }
  .thesis-page .btn-primary:hover { background: var(--accent-hover); box-shadow: 0 0 20px rgba(249, 115, 22, 0.25); }
  .thesis-page .btn-primary:active { transform: scale(0.98); }
  .thesis-page .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; box-shadow: none; }

  .thesis-page .btn-lg { padding: 0.75rem 1.5rem; font-size: 1rem; }

  .thesis-page .btn-secondary { background: transparent; color: var(--text); border: 1px solid var(--border); padding: 0.625rem 1.25rem; font-size: 0.875rem; }
  .thesis-page .btn-secondary:hover { border-color: var(--text-dim); background: var(--surface); }

  .thesis-page .btn-ghost { color: var(--text-muted); padding: 0.625rem 1.25rem; font-size: 0.875rem; border: 1px solid var(--border); border-radius: var(--radius-sm); background: transparent; transition: all 0.15s ease; }
  .thesis-page .btn-ghost:hover { border-color: var(--text-dim); background: var(--surface); color: var(--text); }

  .thesis-page .btn-sm { padding: 0.375rem 0.75rem; font-size: 0.8rem; }

  .thesis-page .landing-hero {
    padding: 5rem 2rem 4rem; max-width: var(--max-width); margin: 0 auto;
    display: grid; grid-template-columns: 1fr 1fr; gap: 4rem; align-items: center;
  }

  .thesis-page .landing-hero h1 { font-size: 3.25rem; font-weight: 700; line-height: 1.1; margin-bottom: 1.5rem; letter-spacing: -0.03em; }
  .thesis-page .landing-hero h1 span { color: var(--accent); }
  .thesis-page .landing-hero p { font-size: 1.125rem; color: var(--text-muted); margin-bottom: 2rem; max-width: 480px; line-height: 1.6; }
  .thesis-page .landing-hero-cta { display: flex; gap: 1rem; align-items: center; }
  .thesis-page .landing-hero-note { margin-top: 1.5rem; font-size: 0.8rem; color: var(--text-dim); font-family: var(--font-mono); }

  .thesis-page .signal-flow {
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg);
    position: relative; overflow: hidden;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(249, 115, 22, 0.06);
  }

  .thesis-page .signal-flow::before {
    content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
    background: linear-gradient(90deg, var(--accent), var(--accent-light), var(--accent));
    background-size: 200% 100%; animation: tp-shimmer 3s ease infinite;
  }

  @keyframes tp-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
  @keyframes tp-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

  .thesis-page .signal-flow-header { padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-light); }
  .thesis-page .signal-flow-title { font-size: 0.7rem; font-weight: 600; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.08em; }

  .thesis-page .signal-flow-status { display: flex; align-items: center; gap: 6px; font-size: 0.7rem; font-weight: 500; color: var(--success); }
  .thesis-page .signal-flow-status::before { content: ''; width: 6px; height: 6px; background: var(--success); border-radius: 50%; animation: tp-pulse 2s infinite; }

  .thesis-page .signal-flow-body { padding: 0; }

  .thesis-page .signal-stream { display: flex; flex-direction: column; font-family: var(--font-mono); font-size: 0.72rem; min-height: 172px; }

  .thesis-page .signal-item { display: flex; align-items: flex-start; gap: 10px; padding: 10px 20px; border-bottom: 1px solid var(--border-light); opacity: 0; transform: translateX(-8px); transition: opacity 0.35s ease, transform 0.35s ease; }
  .thesis-page .signal-item.visible { opacity: 1; transform: translateX(0); }
  .thesis-page .signal-item:last-child { border-bottom: none; }

  .thesis-page .signal-icon { width: 22px; height: 22px; border-radius: 5px; display: flex; align-items: center; justify-content: center; font-size: 0.65rem; font-weight: 700; flex-shrink: 0; margin-top: 1px; }
  .thesis-page .signal-icon.source { background: rgba(249, 115, 22, 0.15); color: var(--accent); border: 1px solid rgba(249, 115, 22, 0.25); }
  .thesis-page .signal-icon.github { background: rgba(139, 148, 158, 0.12); color: var(--text-muted); border: 1px solid rgba(139, 148, 158, 0.2); }
  .thesis-page .signal-icon.github svg { width: 12px; height: 12px; }
  .thesis-page .signal-icon.think { background: rgba(139, 148, 158, 0.15); color: var(--text-muted); border: 1px solid rgba(139, 148, 158, 0.2); }
  .thesis-page .signal-icon.exec { background: rgba(34, 197, 94, 0.15); color: var(--success); border: 1px solid rgba(34, 197, 94, 0.25); }
  .thesis-page .signal-icon.balance { background: rgba(34, 197, 94, 0.15); color: var(--success); border: 1px solid rgba(34, 197, 94, 0.25); }

  .thesis-page .signal-content { flex: 1; display: flex; flex-direction: column; gap: 2px; }
  .thesis-page .signal-text { color: var(--text-muted); line-height: 1.4; font-size: 0.72rem; }
  .thesis-page .signal-text em { color: var(--text); font-style: normal; font-weight: 500; }

  .thesis-page .signal-flow-footer { padding: 10px 20px; border-top: 1px solid var(--border-light); display: flex; justify-content: space-between; align-items: center; }
  .thesis-page .signal-flow-sources { display: flex; align-items: center; gap: 6px; }
  .thesis-page .signal-flow-sources-label { font-size: 0.6rem; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.04em; }
  .thesis-page .signal-flow-source-tag { width: 22px; height: 22px; border-radius: 5px; display: flex; align-items: center; justify-content: center; background: rgba(139, 148, 158, 0.1); border: 1px solid rgba(139, 148, 158, 0.15); color: var(--text-muted); font-size: 0.7rem; line-height: 1; }
  .thesis-page .signal-flow-source-more { font-size: 0.55rem; color: var(--text-dim); font-style: italic; }
  .thesis-page .signal-flow-cadence { font-size: 0.65rem; color: var(--text-dim); font-family: var(--font-mono); }

  .thesis-page .landing-trust { padding: 3rem 2rem; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
  .thesis-page .landing-trust-inner { max-width: var(--max-width); margin: 0 auto; display: flex; justify-content: center; gap: 3rem; }
  .thesis-page .landing-trust-item { display: flex; align-items: center; gap: 0.6rem; font-size: 0.85rem; color: var(--text-muted); transition: color 0.2s; }
  .thesis-page .landing-trust-item:hover { color: var(--text); }
  .thesis-page .landing-trust-icon { color: var(--accent); font-size: 0.45rem; flex-shrink: 0; }

  .thesis-page .landing-final { padding: 5rem 2rem; text-align: center; }
  .thesis-page .landing-final h2 { font-size: 2.25rem; font-weight: 700; margin-bottom: 0.75rem; letter-spacing: -0.03em; }
  .thesis-page .landing-final p { font-size: 1rem; color: var(--text-muted); margin-bottom: 2rem; max-width: 460px; margin-left: auto; margin-right: auto; line-height: 1.6; }

  .thesis-page .landing-venues { display: flex; justify-content: center; gap: 0.75rem; margin-top: 2.5rem; flex-wrap: wrap; }
  .thesis-page .landing-venue { display: flex; align-items: center; gap: 0.5rem; color: var(--text-muted); padding: 0.5rem 1rem; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); font-family: var(--font-mono); font-size: 0.8rem; transition: border-color 0.2s; }
  .thesis-page .landing-venue:hover { border-color: var(--text-dim); }
  .thesis-page .landing-venue-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); }

  .thesis-page .landing-footer { padding: 2.5rem 2rem; text-align: center; font-size: 0.8rem; color: var(--text-dim); border-top: 1px solid var(--border); }
  .thesis-page .landing-footer a { color: var(--text-muted); transition: color 0.2s; }
  .thesis-page .landing-footer a:hover { color: var(--accent); }
  .thesis-page .landing-footer-links { display: flex; justify-content: center; gap: 1.5rem; flex-wrap: wrap; }

  .thesis-page .wizard-card { max-width: var(--wizard-width); margin: 0 auto; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden; box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2); }
  .thesis-page .wizard-card-header { padding: 24px 28px 20px; border-bottom: 1px solid var(--border-light); position: relative; }
  .thesis-page .wizard-card-header::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px; background: linear-gradient(90deg, var(--accent), var(--accent-light), var(--accent)); background-size: 200% 100%; animation: tp-shimmer 3s ease infinite; border-radius: var(--radius-lg) var(--radius-lg) 0 0; }
  .thesis-page .wizard-card-body { padding: 24px 28px; }
  .thesis-page .wizard-card-footer { padding: 16px 28px; border-top: 1px solid var(--border-light); display: flex; justify-content: space-between; align-items: center; background: rgba(13, 17, 23, 0.5); }

  .thesis-page .section-title { font-size: 1.125rem; font-weight: 600; margin-bottom: 4px; letter-spacing: -0.01em; }
  .thesis-page .section-sub { color: var(--text-muted); font-size: 0.85rem; }

  .thesis-page .form-section { padding: 16px 0; border-bottom: 1px solid var(--border-light); }
  .thesis-page .form-section:last-child { border-bottom: none; padding-bottom: 0; }
  .thesis-page .form-section:first-child { padding-top: 0; }
  .thesis-page .form-section-label { font-size: 0.7rem; font-weight: 600; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 10px; display: flex; align-items: center; gap: 6px; }
  .thesis-page .accent-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); }

  .thesis-page .field { display: grid; gap: 6px; }
  .thesis-page .field select { border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg); padding: 9px 12px; color: var(--text); outline: none; transition: border-color 0.15s; font-size: 0.875rem; width: 100%; cursor: pointer; }
  .thesis-page .field select:focus { border-color: var(--accent); }

  .thesis-page .thesis-box { border: 1px solid var(--border); background: var(--bg); border-radius: var(--radius); overflow: hidden; transition: border-color 0.15s; }
  .thesis-page .thesis-box:focus-within { border-color: var(--accent); }
  .thesis-page .thesis-textarea { border: none; background: transparent; color: var(--text); min-height: 100px; resize: vertical; outline: none; font-size: 0.9375rem; line-height: 1.5; padding: 14px 16px; width: 100%; display: block; }
  .thesis-page .thesis-textarea::placeholder { color: var(--text-dim); }
  .thesis-page .thesis-toolbar { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border-top: 1px solid var(--border-light); background: rgba(13, 17, 23, 0.3); }
  .thesis-page .thesis-toolbar-left { display: flex; align-items: center; gap: 8px; }
  .thesis-page .attach-btn { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 6px; border: 1px solid var(--border); background: transparent; color: var(--text-dim); font-size: 0.75rem; transition: all 0.15s; cursor: pointer; }
  .thesis-page .attach-btn:hover { border-color: var(--text-dim); color: var(--text-muted); }
  .thesis-page .thesis-hint { font-size: 0.75rem; color: var(--text-dim); }
  .thesis-page .file-list { font-size: 0.75rem; color: var(--text-muted); display: flex; gap: 8px; flex-wrap: wrap; font-family: var(--font-mono); }
  .thesis-page .file-chip { padding: 2px 8px; border-radius: 4px; background: var(--accent-glow); color: var(--accent-light); font-size: 0.7rem; }

  .thesis-page .strategy-card { border-radius: var(--radius); border: 1px solid var(--border); background: var(--bg); overflow: auto; max-height: 480px; }
  .thesis-page .strategy-card::-webkit-scrollbar { width: 6px; }
  .thesis-page .strategy-card::-webkit-scrollbar-thumb { background: var(--border); border-radius: 6px; }
  .thesis-page .strategy-empty { color: var(--text-dim); font-size: 0.85rem; padding: 48px 24px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 8px; }
  .thesis-page .strategy-empty-icon { width: 48px; height: 48px; border-radius: 50%; background: var(--surface); border: 1px solid var(--border); display: grid; place-items: center; font-size: 1.25rem; color: var(--text-dim); margin-bottom: 4px; }
  .thesis-page .strategy-content { padding: 20px; }
  .thesis-page .strategy-title { font-size: 1.125rem; font-weight: 600; letter-spacing: -0.01em; margin-bottom: 16px; }
  .thesis-page .strategy-section { display: grid; gap: 8px; padding: 12px 0; border-bottom: 1px solid var(--border-light); }
  .thesis-page .strategy-section:last-child { border-bottom: none; }
  .thesis-page .strategy-section h4 { font-size: 0.65rem; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; }
  .thesis-page .bullet-list { display: grid; gap: 5px; font-size: 0.85rem; color: var(--text); }
  .thesis-page .bullet-item { display: flex; gap: 8px; align-items: flex-start; }
  .thesis-page .bullet-dot { width: 4px; height: 4px; border-radius: 50%; background: var(--text-dim); margin-top: 8px; flex-shrink: 0; }

  .thesis-page .chip-row { display: flex; flex-wrap: wrap; gap: 6px; }
  .thesis-page .chip { border: 1px solid var(--border); padding: 4px 10px; border-radius: 999px; font-size: 0.7rem; color: var(--text-muted); background: transparent; transition: all 0.15s; }
  .thesis-page .chip-active { border-color: var(--accent); background: var(--accent-glow); color: var(--accent-light); }
  .thesis-page .chip:hover:not(.chip-active) { border-color: var(--text-dim); }
  .thesis-page .logo-row { display: flex; flex-wrap: wrap; gap: 6px; }
  .thesis-page .logo-chip { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 999px; border: 1px solid var(--border); font-size: 0.7rem; color: var(--text-muted); }
  .thesis-page .inline-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .thesis-page .callout { border: 1px solid rgba(249, 115, 22, 0.2); background: var(--accent-glow); color: var(--accent-light); padding: 10px 14px; border-radius: var(--radius-sm); font-size: 0.75rem; }
  .thesis-page .status-badge { font-size: 0.7rem; color: var(--warning); border: 1px solid rgba(234, 179, 8, 0.3); background: rgba(234, 179, 8, 0.08); padding: 3px 10px; border-radius: 999px; display: inline-flex; align-items: center; gap: 4px; }

  .thesis-page .deposit-section { display: grid; gap: 20px; }
  .thesis-page .deposit-note { font-size: 0.8rem; color: var(--text-muted); line-height: 1.5; padding: 12px 14px; background: var(--accent-glow); border: 1px solid rgba(249, 115, 22, 0.2); border-radius: var(--radius-sm); }
  .thesis-page .deposit-markets { display: grid; gap: 8px; }
  .thesis-page .deposit-market-card { padding: 14px 16px; border-radius: var(--radius); border: 1px solid var(--border); background: var(--bg); display: flex; align-items: center; gap: 12px; transition: border-color 0.2s; }
  .thesis-page .deposit-market-card:hover { border-color: var(--text-dim); }
  .thesis-page .market-icon { width: 32px; height: 32px; border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.75rem; flex-shrink: 0; background: var(--surface); border: 1px solid var(--border); color: var(--text-muted); }
  .thesis-page .market-info { flex: 1; display: grid; gap: 1px; min-width: 0; }
  .thesis-page .market-name { font-weight: 600; font-size: 0.85rem; }
  .thesis-page .market-addr { font-family: var(--font-mono); font-size: 0.72rem; color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .thesis-page .market-actions { display: flex; gap: 6px; flex-shrink: 0; }
  .thesis-page .market-qr-btn, .thesis-page .market-copy-btn { width: 32px; height: 32px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--surface); color: var(--text-muted); display: grid; place-items: center; font-size: 0.8rem; cursor: pointer; transition: all 0.15s; }
  .thesis-page .market-qr-btn:hover, .thesis-page .market-copy-btn:hover { border-color: var(--accent); color: var(--accent); }
  .thesis-page .market-copy-btn.copied { border-color: var(--success); color: var(--success); }

  .thesis-page .wizard-card-divider { display: flex; align-items: center; gap: 16px; padding: 0 28px; }
  .thesis-page .wizard-card-divider::before, .thesis-page .wizard-card-divider::after { content: ''; flex: 1; height: 1px; background: var(--border); }
  .thesis-page .wizard-card-divider-text { font-size: 0.7rem; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.08em; font-weight: 500; }

  .thesis-page .paper-trading-option { display: flex; align-items: center; gap: 14px; padding: 16px 18px; border-radius: var(--radius); border: 1px dashed var(--border); background: rgba(13, 17, 23, 0.4); transition: border-color 0.2s; }
  .thesis-page .paper-trading-option:hover { border-color: var(--text-dim); }
  .thesis-page .paper-trading-icon { width: 36px; height: 36px; border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center; font-size: 1.1rem; flex-shrink: 0; background: var(--surface); border: 1px solid var(--border); }
  .thesis-page .paper-trading-info { flex: 1; min-width: 0; }
  .thesis-page .paper-trading-title { font-weight: 600; font-size: 0.85rem; margin-bottom: 2px; }
  .thesis-page .paper-trading-desc { font-size: 0.75rem; color: var(--text-muted); line-height: 1.4; }

  .thesis-page .qr-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); display: none; place-items: center; z-index: 200; animation: tp-fadeIn 150ms ease; }
  .thesis-page .qr-overlay.active { display: grid; }
  .thesis-page .qr-modal { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); width: 340px; max-width: 90vw; overflow: hidden; box-shadow: 0 8px 40px rgba(0, 0, 0, 0.4); animation: tp-landingFadeUp 0.25s ease both; }
  .thesis-page .qr-modal-header { padding: 16px 20px; border-bottom: 1px solid var(--border-light); display: flex; justify-content: space-between; align-items: center; }
  .thesis-page .qr-modal-title { font-weight: 600; font-size: 0.95rem; }
  .thesis-page .qr-close { width: 28px; height: 28px; border-radius: 6px; display: grid; place-items: center; font-size: 1.2rem; color: var(--text-dim); transition: all 0.15s; cursor: pointer; }
  .thesis-page .qr-close:hover { background: var(--bg); color: var(--text); }
  .thesis-page .qr-modal-body { padding: 24px 20px; display: flex; flex-direction: column; align-items: center; gap: 16px; }
  .thesis-page .qr-code { width: 200px; height: 200px; background: #fff; border-radius: var(--radius); display: grid; place-items: center; padding: 12px; }
  .thesis-page .qr-code svg { width: 100%; height: 100%; }
  .thesis-page .qr-address { font-family: var(--font-mono); font-size: 0.72rem; color: var(--text-muted); word-break: break-all; text-align: center; line-height: 1.5; max-width: 280px; }
  .thesis-page .qr-copy-btn { width: 100%; border: 1px solid var(--border); padding: 0.5rem; border-radius: var(--radius-sm); background: var(--surface); color: var(--text-muted); font-size: 0.8rem; cursor: pointer; transition: all 0.15s; }
  .thesis-page .qr-copy-btn:hover { border-color: var(--accent); color: var(--accent); }
  .thesis-page .qr-copy-btn.copied { border-color: var(--success); color: var(--success); }

  .thesis-page .disclaimer { font-size: 0.7rem; color: var(--text-dim); max-width: 360px; }
  .thesis-page .secondary-label { font-size: 0.7rem; color: var(--text-dim); }

  .thesis-page .step { display: none; animation: tp-fadeIn 250ms ease; }
  .thesis-page .step.active { display: block; }

  @keyframes tp-fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes tp-landingFadeUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }

  .thesis-page .landing-hero > div:first-child { animation: tp-landingFadeUp 0.6s ease both; }
  .thesis-page .landing-hero .signal-flow { animation: tp-landingFadeUp 0.6s ease 0.15s both; }
  .thesis-page .landing-trust { animation: tp-landingFadeUp 0.5s ease 0.3s both; }
  .thesis-page .landing-final { animation: tp-landingFadeUp 0.5s ease 0.4s both; }

  .thesis-page .loading-dots { display: inline-flex; gap: 4px; align-items: center; }
  .thesis-page .loading-dots span { width: 4px; height: 4px; border-radius: 50%; background: var(--accent); animation: tp-dotPulse 1.2s infinite; }
  .thesis-page .loading-dots span:nth-child(2) { animation-delay: 0.2s; }
  .thesis-page .loading-dots span:nth-child(3) { animation-delay: 0.4s; }
  @keyframes tp-dotPulse { 0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); } 40% { opacity: 1; transform: scale(1); } }

  @media (max-width: 1024px) {
    .thesis-page .landing-hero { grid-template-columns: 1fr; gap: 3rem; text-align: center; padding: 4rem 2rem 3rem; }
    .thesis-page .landing-hero p { margin-left: auto; margin-right: auto; }
    .thesis-page .landing-hero-cta { justify-content: center; }
    .thesis-page .landing-hero-note { text-align: center; }
    .thesis-page .landing-hero .signal-flow { max-width: 480px; margin: 0 auto; }
  }

  @media (max-width: 768px) {
    .thesis-page .step-dot-label { display: none; }
    .thesis-page .wizard-card-header, .thesis-page .wizard-card-body, .thesis-page .wizard-card-footer, .thesis-page .wizard-card-divider { padding-left: 20px; padding-right: 20px; }
  }

  @media (max-width: 640px) {
    .thesis-page .landing-hero { padding: 3rem 1.5rem 2.5rem; }
    .thesis-page .landing-hero h1 { font-size: 2.25rem; }
    .thesis-page .landing-hero p { font-size: 1rem; }
    .thesis-page .landing-nav-links { display: none; }
    .thesis-page .landing-trust { padding: 2rem 1.5rem; }
    .thesis-page .landing-trust-inner { flex-direction: column; gap: 1rem; align-items: center; text-align: center; }
    .thesis-page .landing-venues { flex-direction: column; align-items: center; }
    .thesis-page .landing-final { padding: 3.5rem 1.5rem; }
    .thesis-page .landing-final h2 { font-size: 1.75rem; }
  }
`;

const VINCENT_LOGO_SVG = '<svg viewBox="0 0 530 525" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M312.061 419.051L312.62 417.933L312.061 416.815L106.233 5.09329L105.542 3.71118H103.997H9H4.95521L6.76386 7.32907L260.09 514.064L262.326 518.536L264.562 514.064L312.061 419.051Z" fill="#f97316" stroke="#f97316" stroke-width="5"/><path d="M523.241 7.10877L525.044 3.46529L520.979 3.50009L430.555 4.27427L429.041 4.28723L428.351 5.63525L293.033 270.052L292.457 271.178L293.022 272.309L340.521 367.322L342.768 371.818L344.998 367.312L523.241 7.10877Z" fill="#f97316" stroke="#f97316" stroke-width="5"/></svg>';

const GH_ICON_SVG = '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>';

const GH_SOURCE_TAG_SVG = '<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>';

export default function Thesis() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = 'Vincent — Your Thesis, Running 24/7';
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute('content', 'Define your thesis, set spending policies, and let a self-improving agent execute — with an airgapped vault and human-in-the-loop approvals.');
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // ── Data ──
    const markets = [
      { id: 'btc', name: 'BTC', desc: 'Bitcoin native, Lightning', icon: '\u20BF', addr: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4' },
      { id: 'evm', name: 'EVM', desc: 'Ethereum, Base, Arbitrum, Polygon', icon: '\u039E', addr: '0x1a2B3c4D5e6F7a8B9c0D1e2F3a4B5c6D7e8F7f9E' },
      { id: 'solana', name: 'Solana', desc: 'SPL tokens, Jupiter, Raydium', icon: 'S', addr: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU' },
      { id: 'polymarket', name: 'Polymarket', desc: 'Prediction markets, event contracts', icon: 'P', addr: '0x4bBa290826C253BD854121346C370a9886d1bC26' },
    ];

    const templates = [
      { id: 'attention-breakout', label: 'Trending story', category: 'Popular', thesis: 'AI tokens are about to re-rate as funding + attention accelerate.', strategyName: 'AI Attention Breakout Strategy' },
      { id: 'event-driven', label: 'Event catalyst', category: 'Events', thesis: 'Polymarket is mispricing the next macro event; I want to express that view with strict risk limits.', strategyName: 'Event-Driven Probability Strategy' },
      { id: 'relative-strength', label: 'Relative strength', category: 'Market moves', thesis: 'ETH momentum should outpace BTC as flows rotate; I want systematic entries.', strategyName: 'Relative Strength Rotation' },
      { id: 'mean-reversion', label: 'Mean reversion', category: 'Market moves', thesis: 'Overextended moves revert; I want to fade extremes with tight risk caps.', strategyName: 'Mean Reversion Guardrail' },
      { id: 'arbitrage', label: 'Basis / funding', category: 'Market structure', thesis: 'Perps funding spikes create short-term basis trades with defined exits.', strategyName: 'Funding Basis Capture' },
      { id: 'breakout', label: 'Momentum breakout', category: 'Market moves', thesis: 'Breakouts with volume confirmation tend to extend; I want structured entries and exits.', strategyName: 'Momentum Breakout' },
      { id: 'sentiment-shift', label: 'Sentiment shift', category: 'Popular', thesis: 'Narratives can flip quickly; I want alerts and entries when sentiment turns.', strategyName: 'Sentiment Shift Tracker' },
      { id: 'dev-activity', label: 'Developer momentum', category: 'Signals', thesis: 'Sustained dev activity tends to precede market attention; I want to track it.', strategyName: 'Developer Momentum Strategy' },
      { id: 'risk-off', label: 'Risk on / risk off', category: 'Macro', thesis: 'Macro tone shifts should influence positioning with strict caps.', strategyName: 'Risk Regime Strategy' },
      { id: 'dip-buying', label: 'Buy the dip (structured)', category: 'Market moves', thesis: 'Controlled dip-buying can improve entries when volatility spikes.', strategyName: 'Dip-Buying Structure' },
      { id: 'custom', label: 'Custom', category: 'Custom', thesis: '', strategyName: 'Custom Strategy' },
    ];

    const state = {
      step: 0,
      template: templates[0].id,
      thesis: templates[0].thesis,
      strategy: null as any,
      riskProfile: 'Moderate',
      strategyDirty: false,
      loading: false,
      error: '',
    };

    // ── DOM refs ──
    const steps = Array.from(el.querySelectorAll('.step'));
    const stepIndicator = el.querySelector('#stepIndicator') as HTMLElement;
    const templateSelect = el.querySelector('#templateSelect') as HTMLSelectElement;
    const thesisText = el.querySelector('#thesisText') as HTMLTextAreaElement;
    const generateBtn = el.querySelector('#generateBtn') as HTMLButtonElement;
    const generateStatus = el.querySelector('#generateStatus') as HTMLElement;
    const strategyEmpty = el.querySelector('#strategyEmpty') as HTMLElement;
    const strategyContent = el.querySelector('#strategyContent') as HTMLElement;
    const strategyStale = el.querySelector('#strategyStale') as HTMLElement;
    const depositMarkets = el.querySelector('#depositMarkets') as HTMLElement;
    const continueFunding = el.querySelector('#continueFunding') as HTMLButtonElement;
    const qrOverlay = el.querySelector('#qrOverlay') as HTMLElement;
    const qrTitle = el.querySelector('#qrTitle') as HTMLElement;
    const qrCode = el.querySelector('#qrCode') as HTMLElement;
    const qrAddress = el.querySelector('#qrAddress') as HTMLElement;
    const qrCopyBtn = el.querySelector('#qrCopyBtn') as HTMLButtonElement;
    const qrClose = el.querySelector('#qrClose') as HTMLButtonElement;
    const attachBtn = el.querySelector('#attachBtn') as HTMLButtonElement;
    const fileInput = el.querySelector('#fileInput') as HTMLInputElement;
    const fileList = el.querySelector('#fileList') as HTMLElement;
    const signalStream = el.querySelector('#signalStream') as HTMLElement;

    function setStep(index: number) {
      state.step = Math.max(0, Math.min(steps.length - 1, index));
      steps.forEach((s, i) => s.classList.toggle('active', i === state.step));
      el!.classList.toggle('tp-landing', state.step === 0);
      updateStepIndicator();
    }

    function updateStepIndicator() {
      const wizardStep = state.step;
      const dots = stepIndicator.querySelectorAll('.step-dot');
      const connectors = stepIndicator.querySelectorAll('.step-connector');
      dots.forEach((dot, i) => {
        const stepNum = i + 1;
        dot.classList.remove('active', 'completed');
        if (stepNum === wizardStep) dot.classList.add('active');
        else if (stepNum < wizardStep) dot.classList.add('completed');
      });
      connectors.forEach((conn, i) => {
        conn.classList.toggle('completed', (i + 1) < wizardStep);
      });
    }

    function renderTemplates() {
      templateSelect.innerHTML = '';
      const categories = [...new Set(templates.map(t => t.category || 'Other'))];
      categories.forEach(category => {
        const group = document.createElement('optgroup');
        group.label = category;
        templates.filter(t => (t.category || 'Other') === category).forEach(t => {
          const opt = document.createElement('option');
          opt.value = t.id;
          opt.textContent = t.label;
          group.appendChild(opt);
        });
        templateSelect.appendChild(group);
      });
      templateSelect.value = state.template;
      thesisText.value = state.thesis;
    }

    function validateGenerate() {
      const ok = state.thesis.trim().length > 0;
      generateBtn.disabled = !ok || state.loading;
    }

    function markStrategyDirty() {
      if (state.strategy) {
        state.strategyDirty = true;
        strategyStale.style.display = 'inline-flex';
        continueFunding.disabled = true;
      }
    }

    function setLoading(isLoading: boolean) {
      state.loading = isLoading;
      generateBtn.disabled = isLoading;
      if (isLoading) {
        generateBtn.innerHTML = '<div class="loading-dots"><span></span><span></span><span></span></div> Generating';
        generateStatus.textContent = '';
      } else {
        generateBtn.textContent = 'Generate strategy \u2192';
        validateGenerate();
      }
    }

    function mockStrategyResponse() {
      const template = templates.find(t => t.id === state.template) || templates[0];
      return {
        strategy_name: template.strategyName,
        abstract: 'Monitors narrative and developer momentum for inflection points, enters on multi-signal confirmation, and exits systematically with capped downside.',
        execution_logic: [
          'Entry: attention velocity > 30-day baseline and breakout volume confirmation',
          'Confirmation: dev activity trend is positive (GitHub stars + repo velocity)',
          'Exit: stop-loss or take-profit triggers, or signal decay over 48 hours',
          'Cadence: checks every 15 minutes with hourly aggregation',
        ],
        monitoring_signals: [
          'Narrative velocity on X',
          'Price + volume breakouts vs baseline',
          'Developer momentum on GitHub',
        ],
        risk_profiles: {
          Conservative: ['Max allocation per trade: 2%', 'Daily loss limit: $150', 'Stop-loss: 4%', 'Take-profit: 8%'],
          Moderate: ['Max allocation per trade: 3%', 'Daily loss limit: $250', 'Stop-loss: 6%', 'Take-profit: 12%'],
          Aggressive: ['Max allocation per trade: 5%', 'Daily loss limit: $500', 'Stop-loss: 8%', 'Take-profit: 18%'],
        } as Record<string, string[]>,
        disclaimers: 'You can change assumptions (risk, sensitivity, sizing, exits) after onboarding.',
      };
    }

    function renderStrategy() {
      if (!state.strategy) {
        strategyEmpty.style.display = 'flex';
        strategyContent.style.display = 'none';
        strategyStale.style.display = 'none';
        continueFunding.disabled = true;
        return;
      }
      strategyEmpty.style.display = 'none';
      strategyContent.style.display = 'block';
      const s = state.strategy;
      strategyContent.innerHTML = `
        <div class="strategy-content">
          <div class="strategy-title">${s.strategy_name}</div>
          <div class="strategy-section"><h4>Abstract</h4><div class="bullet-list"><div>${s.abstract}</div></div></div>
          <div class="strategy-section"><h4>Markets</h4><div class="logo-row"><div class="logo-chip">BTC</div><div class="logo-chip">EVM</div><div class="logo-chip">Solana</div><div class="logo-chip">Polymarket</div></div></div>
          <div class="strategy-section"><h4>Execution logic</h4><div class="bullet-list">${s.execution_logic.map((x: string) => `<div class="bullet-item"><span class="bullet-dot"></span><span>${x}</span></div>`).join('')}</div></div>
          <div class="strategy-section"><h4>Monitoring signals</h4><div class="bullet-list">${s.monitoring_signals.map((x: string) => `<div class="bullet-item"><span class="bullet-dot"></span><span>${x}</span></div>`).join('')}</div></div>
          <div class="strategy-section"><h4>Risk controls</h4><div class="inline-row" style="gap:6px; margin-bottom:8px;"><div class="chip-row">${['Conservative','Moderate','Aggressive'].map(p => `<button class="chip ${state.riskProfile===p?'chip-active':''}" data-risk="${p}">${p}</button>`).join('')}</div></div><div class="chip-row">${(s.risk_profiles[state.riskProfile]||[]).map((x: string) => `<div class="chip">${x}</div>`).join('')}</div></div>
          <div class="callout">${s.disclaimers}</div>
        </div>`;
      strategyContent.querySelectorAll('[data-risk]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          state.riskProfile = (e.target as HTMLElement).getAttribute('data-risk') || 'Moderate';
          renderStrategy();
        });
      });
      continueFunding.disabled = false;
    }

    function generateQRSvg(text: string) {
      const size = 25;
      const cellSize = 8;
      const svgSize = size * cellSize;
      let hash = 0;
      for (let i = 0; i < text.length; i++) { hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0; }
      const rng = (function(s: number) { return function() { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; })(Math.abs(hash));
      let cells = '';
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const inFinderTL = x < 7 && y < 7;
          const inFinderTR = x >= size - 7 && y < 7;
          const inFinderBL = x < 7 && y >= size - 7;
          if (inFinderTL || inFinderTR || inFinderBL) {
            const fx = inFinderTL ? x : inFinderTR ? x - (size - 7) : x;
            const fy = inFinderTL ? y : inFinderTR ? y : y - (size - 7);
            const border = fx === 0 || fx === 6 || fy === 0 || fy === 6;
            const inner = fx >= 2 && fx <= 4 && fy >= 2 && fy <= 4;
            if (border || inner) { cells += `<rect x="${x*cellSize}" y="${y*cellSize}" width="${cellSize}" height="${cellSize}" fill="#000"/>`; }
            continue;
          }
          if (x === 6 && y % 2 === 0) { cells += `<rect x="${x*cellSize}" y="${y*cellSize}" width="${cellSize}" height="${cellSize}" fill="#000"/>`; continue; }
          if (y === 6 && x % 2 === 0) { cells += `<rect x="${x*cellSize}" y="${y*cellSize}" width="${cellSize}" height="${cellSize}" fill="#000"/>`; continue; }
          if (rng() > 0.5) { cells += `<rect x="${x*cellSize}" y="${y*cellSize}" width="${cellSize}" height="${cellSize}" fill="#000"/>`; }
        }
      }
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgSize} ${svgSize}">${cells}</svg>`;
    }

    function showQR(market: typeof markets[0]) {
      qrTitle.textContent = `Deposit \u2014 ${market.name}`;
      qrCode.innerHTML = generateQRSvg(market.addr);
      qrAddress.textContent = market.addr;
      qrCopyBtn.textContent = 'Copy address';
      qrCopyBtn.classList.remove('copied');
      qrCopyBtn.onclick = () => {
        navigator.clipboard.writeText(market.addr).then(() => {
          qrCopyBtn.textContent = 'Copied!';
          qrCopyBtn.classList.add('copied');
          setTimeout(() => { qrCopyBtn.textContent = 'Copy address'; qrCopyBtn.classList.remove('copied'); }, 2000);
        });
      };
      qrOverlay.classList.add('active');
    }

    qrClose.addEventListener('click', () => qrOverlay.classList.remove('active'));
    qrOverlay.addEventListener('click', (e) => { if (e.target === qrOverlay) qrOverlay.classList.remove('active'); });
    const escHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') qrOverlay.classList.remove('active'); };
    document.addEventListener('keydown', escHandler);

    function truncAddr(addr: string) {
      if (addr.length <= 16) return addr;
      return addr.slice(0, 8) + '\u2026' + addr.slice(-6);
    }

    const copyIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>';
    const checkIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';

    function renderMarkets() {
      depositMarkets.innerHTML = '';
      markets.forEach(m => {
        const card = document.createElement('div');
        card.className = 'deposit-market-card';
        card.innerHTML = `
          <div class="market-icon">${m.icon}</div>
          <div class="market-info"><div class="market-name">${m.name}</div><div class="market-addr">${truncAddr(m.addr)}</div></div>
          <div class="market-actions">
            <button class="market-copy-btn" title="Copy address">${copyIcon}</button>
            <button class="market-qr-btn" title="Show QR code"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="3" height="3"/><line x1="21" y1="14" x2="21" y2="21"/><line x1="14" y1="21" x2="21" y2="21"/></svg></button>
          </div>`;
        card.querySelector('.market-qr-btn')!.addEventListener('click', () => showQR(m));
        card.querySelector('.market-copy-btn')!.addEventListener('click', function(this: HTMLButtonElement) {
          const btn = this;
          navigator.clipboard.writeText(m.addr).then(() => {
            btn.innerHTML = checkIcon;
            btn.classList.add('copied');
            setTimeout(() => { btn.innerHTML = copyIcon; btn.classList.remove('copied'); }, 2000);
          });
        });
        depositMarkets.appendChild(card);
      });
    }

    // ── Navigation ──
    el.querySelectorAll('[data-next]').forEach(btn => btn.addEventListener('click', () => setStep(state.step + 1)));
    el.querySelectorAll('[data-back]').forEach(btn => btn.addEventListener('click', () => setStep(state.step - 1)));

    // ── Init ──
    renderTemplates();
    validateGenerate();
    renderMarkets();
    setStep(0);

    templateSelect.addEventListener('change', (e) => {
      const t = templates.find(x => x.id === (e.target as HTMLSelectElement).value);
      if (!t) return;
      state.template = t.id;
      state.thesis = t.thesis || '';
      thesisText.value = state.thesis;
      markStrategyDirty();
      validateGenerate();
    });

    thesisText.addEventListener('input', (e) => {
      state.thesis = (e.target as HTMLTextAreaElement).value;
      markStrategyDirty();
      validateGenerate();
    });

    generateBtn.addEventListener('click', () => {
      state.error = '';
      setLoading(true);
      setTimeout(() => {
        if (!state.thesis.trim()) {
          generateStatus.textContent = "Couldn't compile. Please enter a thesis.";
          setLoading(false);
          return;
        }
        state.strategy = mockStrategyResponse();
        state.strategyDirty = false;
        strategyStale.style.display = 'none';
        generateStatus.textContent = '';
        setLoading(false);
        renderStrategy();
        setStep(2);
      }, 900);
    });

    continueFunding.addEventListener('click', () => { if (!continueFunding.disabled) setStep(3); });

    el.querySelector('#paperTradeBtn')!.addEventListener('click', () => {
      alert('Paper trading mode activated! Your agent will run with $10,000 in simulated funds.');
    });

    attachBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      const files = Array.from(fileInput.files || []);
      fileList.innerHTML = '';
      files.slice(0, 5).forEach(f => {
        const chip = document.createElement('span');
        chip.className = 'file-chip';
        chip.textContent = f.name;
        fileList.appendChild(chip);
      });
      if (files.length > 5) {
        const more = document.createElement('span');
        more.className = 'file-chip';
        more.textContent = `+${files.length - 5} more`;
        fileList.appendChild(more);
      }
    });

    // ── Signal flow animation ──
    const signalScenarios = [
      [
        { icon: '\uD835\uDD4F', cls: 'source', text: '<em>@VitalikButerin</em> on EIP-7702 \u2014 engagement 4.2x baseline' },
        { icon: '\u2699', cls: 'think', text: 'Attention <em>+2.4\u03C3</em> \u00B7 matches thesis \u00B7 within policy limits' },
        { icon: '\u2197', cls: 'exec', text: 'Long <em>ETH @ $2,847</em> \u00B7 stop -6% \u00B7 TP +12%' },
        { icon: '$', cls: 'balance', text: 'Balance <em>$8,714</em> \u00B7 return <em style="color:var(--success)">+5.4%</em>' },
      ],
      [
        { icon: GH_ICON_SVG, cls: 'github', text: '<em>ethereum/EIPs</em> spike \u2014 340 stars in 2h, 28 PRs merged' },
        { icon: '\u2699', cls: 'think', text: 'Dev velocity <em>+3.1\u03C3</em> \u00B7 narrative forming \u00B7 policy OK' },
        { icon: '\u2197', cls: 'exec', text: 'Long <em>ETH @ $2,910</em> \u00B7 stop -5% \u00B7 TP +15%' },
        { icon: '$', cls: 'balance', text: 'Balance <em>$9,102</em> \u00B7 return <em style="color:var(--success)">+8.1%</em>' },
      ],
      [
        { icon: '\uD835\uDD4F', cls: 'source', text: '<em>@GCRClassic</em> flips bearish BTC \u2014 12k engagement' },
        { icon: '\u2699', cls: 'think', text: 'Sentiment shift <em>\u22121.8\u03C3</em> \u00B7 hedge triggered \u00B7 within limits' },
        { icon: '\u2197', cls: 'exec', text: 'Hedge <em>BTC short @ $68,400</em> \u00B7 stop -3% \u00B7 TP +8%' },
        { icon: '$', cls: 'balance', text: 'Balance <em>$8,944</em> \u00B7 return <em style="color:var(--success)">+6.2%</em>' },
      ],
      [
        { icon: GH_ICON_SVG, cls: 'github', text: '<em>solana-labs/solana</em> v1.18 release \u2014 47 contributors' },
        { icon: '\u2699', cls: 'think', text: 'Major release <em>+2.7\u03C3</em> \u00B7 ecosystem catalyst \u00B7 policy check \u2713' },
        { icon: '\u2197', cls: 'exec', text: 'Long <em>SOL @ $187</em> \u00B7 stop -4% \u00B7 TP +14%' },
        { icon: '$', cls: 'balance', text: 'Balance <em>$9,287</em> \u00B7 return <em style="color:var(--success)">+9.3%</em>' },
      ],
    ];

    let currentScenario = 0;
    let animationTimeout: ReturnType<typeof setTimeout>;
    let cancelled = false;

    function renderSignalItems(scenario: typeof signalScenarios[0]) {
      signalStream.innerHTML = '';
      scenario.forEach((item) => {
        const div = document.createElement('div');
        div.className = 'signal-item';
        div.innerHTML = `<div class="signal-icon ${item.cls}">${item.icon}</div><div class="signal-content"><div class="signal-text">${item.text}</div></div>`;
        signalStream.appendChild(div);
      });
    }

    function showItems() {
      const items = signalStream.querySelectorAll('.signal-item');
      items.forEach((item, i) => {
        setTimeout(() => { if (!cancelled) item.classList.add('visible'); }, i * 300);
      });
    }

    function hideItems(cb: () => void) {
      const items = signalStream.querySelectorAll('.signal-item');
      items.forEach((item, i) => {
        setTimeout(() => { if (!cancelled) item.classList.remove('visible'); }, i * 80);
      });
      animationTimeout = setTimeout(() => { if (!cancelled) cb(); }, items.length * 80 + 350);
    }

    function cycleSignals() {
      if (cancelled) return;
      renderSignalItems(signalScenarios[currentScenario]);
      showItems();
      animationTimeout = setTimeout(() => {
        if (cancelled) return;
        hideItems(() => {
          currentScenario = (currentScenario + 1) % signalScenarios.length;
          cycleSignals();
        });
      }, 3500);
    }

    cycleSignals();

    // Cleanup
    return () => {
      cancelled = true;
      clearTimeout(animationTimeout);
      document.removeEventListener('keydown', escHandler);
    };
  }, []);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: THESIS_STYLES }} />
      <div className="thesis-page tp-landing" ref={containerRef}>
        <div className="app">
          {/* Wizard header (shown on steps 1-3) */}
          <div className="wizard-header">
            <div className="wizard-top">
              <div className="logo">
                <div className="logo-mark" dangerouslySetInnerHTML={{ __html: VINCENT_LOGO_SVG }} />
                <div><div>Vincent</div></div>
              </div>
              <div className="step-indicator" id="stepIndicator">
                <div className="step-dot active" data-si="1">
                  <div className="step-dot-circle">1</div>
                  <div className="step-dot-label">Belief</div>
                </div>
                <div className="step-connector"></div>
                <div className="step-dot" data-si="2">
                  <div className="step-dot-circle">2</div>
                  <div className="step-dot-label">Strategy</div>
                </div>
                <div className="step-connector"></div>
                <div className="step-dot" data-si="3">
                  <div className="step-dot-circle">3</div>
                  <div className="step-dot-label">Fund</div>
                </div>
              </div>
            </div>
          </div>

          {/* Step 0: Landing */}
          <section className="step active" data-step="0">
            <nav className="landing-nav">
              <a href="/" className="landing-logo">
                <div className="landing-logo-icon" dangerouslySetInnerHTML={{ __html: VINCENT_LOGO_SVG }} />
                Vincent
              </a>
              <div className="landing-nav-links">
                <a href="/" className="landing-nav-link">About Vincent</a>
                <a href="/security" className="landing-nav-link">Security</a>
                <button className="btn btn-primary" data-next>Start</button>
              </div>
            </nav>

            <section className="landing-hero">
              <div>
                <h1>Your thesis.<br /><span>Running 24/7.</span></h1>
                <p>Define what you believe, set your spending policies, and let a self-improving agent execute &mdash; with an airgapped vault and human-in-the-loop approvals.</p>
                <div className="landing-hero-cta">
                  <button className="btn btn-primary btn-lg" data-next>Start &rarr;</button>
                  <a href="/" className="btn btn-secondary btn-lg">What is Vincent?</a>
                </div>
                <p className="landing-hero-note">Non-custodial &middot; Fully on-chain &middot; Revoke anytime</p>
              </div>
              <div className="signal-flow" id="signalFlow">
                <div className="signal-flow-header">
                  <div className="signal-flow-title">Agent feed</div>
                  <div className="signal-flow-status">Live</div>
                </div>
                <div className="signal-flow-body">
                  <div className="signal-stream" id="signalStream"></div>
                </div>
                <div className="signal-flow-footer">
                  <div className="signal-flow-sources">
                    <span className="signal-flow-sources-label">Sources</span>
                    <span className="signal-flow-source-tag">{'\uD835\uDD4F'}</span>
                    <span className="signal-flow-source-tag" dangerouslySetInnerHTML={{ __html: GH_SOURCE_TAG_SVG }} />
                    <span className="signal-flow-source-more">+more soon</span>
                  </div>
                  <div className="signal-flow-cadence">Every 15m</div>
                </div>
              </div>
            </section>

            <section className="landing-trust">
              <div className="landing-trust-inner">
                <div className="landing-trust-item"><span className="landing-trust-icon">&#9679;</span>Airgapped vault &mdash; secrets never touch the AI</div>
                <div className="landing-trust-item"><span className="landing-trust-icon">&#9679;</span>Spending policies &mdash; limits, approvals, restrictions</div>
                <div className="landing-trust-item"><span className="landing-trust-icon">&#9679;</span>Full audit trail &mdash; every decision logged</div>
              </div>
            </section>

            <section className="landing-final">
              <h2>Put your thesis to work.</h2>
              <p>Your agent learns and improves over time &mdash; governed by the spending policies you set.</p>
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', alignItems: 'center' }}>
                <button className="btn btn-primary btn-lg" data-next>Start &rarr;</button>
                <a href="/" className="btn btn-secondary btn-lg">About Vincent &rarr;</a>
              </div>
              <div className="landing-venues">
                <div className="landing-venue"><span className="landing-venue-dot"></span> BTC</div>
                <div className="landing-venue"><span className="landing-venue-dot"></span> EVM</div>
                <div className="landing-venue"><span className="landing-venue-dot"></span> Solana</div>
                <div className="landing-venue"><span className="landing-venue-dot"></span> Polymarket</div>
              </div>
            </section>

            <footer className="landing-footer">
              <div className="landing-footer-links">
                <a href="/">Vincent</a>
                <a href="/security">Security</a>
                <a href="/features">Features</a>
                <a href="https://discord.gg/FPkF6cZf">Discord</a>
              </div>
              <p style={{ marginTop: '1rem', fontSize: '0.7rem' }}>Simulated example. Your agent is governed by the policies you set.</p>
            </footer>
          </section>

          {/* Step 1: Define belief */}
          <section className="step" data-step="1">
            <div className="wizard-card">
              <div className="wizard-card-header">
                <div className="section-title">Define your belief</div>
                <div className="section-sub">What&apos;s your thesis? Pick a template or write your own.</div>
              </div>
              <div className="wizard-card-body">
                <div className="form-section">
                  <div className="form-section-label"><span className="accent-dot"></span> Starting point</div>
                  <div className="field"><select id="templateSelect"></select></div>
                </div>
                <div className="form-section">
                  <div className="form-section-label"><span className="accent-dot"></span> Your belief</div>
                  <div className="thesis-box">
                    <textarea id="thesisText" className="thesis-textarea" placeholder="e.g. AI tokens are about to re-rate as funding + attention accelerate."></textarea>
                    <div className="thesis-toolbar">
                      <div className="thesis-toolbar-left">
                        <button className="attach-btn" id="attachBtn" title="Attach research">+ Attach</button>
                        <input type="file" id="fileInput" multiple accept=".pdf,image/*,.txt" style={{ display: 'none' }} />
                      </div>
                      <div className="thesis-hint">No need to be perfect &mdash; refine later</div>
                    </div>
                  </div>
                  <div className="file-list" id="fileList"></div>
                </div>
              </div>
              <div className="wizard-card-footer">
                <button className="btn-ghost btn-sm" data-back>Back</button>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div className="secondary-label" id="generateStatus"></div>
                  <button className="btn btn-primary" id="generateBtn" disabled>Generate strategy &rarr;</button>
                </div>
              </div>
            </div>
          </section>

          {/* Step 2: Strategy preview */}
          <section className="step" data-step="2">
            <div className="wizard-card">
              <div className="wizard-card-header">
                <div className="section-title">Strategy preview</div>
                <div className="section-sub">Review how your agent will behave before connecting a venue.</div>
              </div>
              <div className="wizard-card-body" style={{ paddingTop: 0, paddingBottom: 0 }}>
                <div className="strategy-card" id="strategyPanel">
                  <div className="status-badge" id="strategyStale" style={{ display: 'none' }}>Strategy out of date</div>
                  <div className="strategy-empty" id="strategyEmpty">
                    <div className="strategy-empty-icon">&#9881;</div>
                    Generate a strategy to preview agent behavior.
                  </div>
                  <div id="strategyContent" style={{ display: 'none' }}></div>
                </div>
              </div>
              <div className="wizard-card-footer">
                <button className="btn-ghost btn-sm" data-back>Back</button>
                <button className="btn btn-primary" id="continueFunding" disabled>Continue &rarr;</button>
              </div>
            </div>
          </section>

          {/* Step 3: Fund & launch */}
          <section className="step" data-step="3">
            <div className="wizard-card">
              <div className="wizard-card-header">
                <div className="section-title">Fund your agent</div>
                <div className="section-sub">Deposit to any supported network. Vincent handles bridging and routing automatically.</div>
              </div>
              <div className="wizard-card-body">
                <div className="deposit-section">
                  <div className="deposit-note">Send to any address below. Your agent can trade across all supported markets from a single deposit.</div>
                  <div className="deposit-markets" id="depositMarkets"></div>
                </div>
              </div>
              <div className="wizard-card-divider"><span className="wizard-card-divider-text">or</span></div>
              <div className="wizard-card-body" style={{ paddingTop: 0 }}>
                <div className="paper-trading-option">
                  <div className="paper-trading-icon">{'\uD83D\uDCC4'}</div>
                  <div className="paper-trading-info">
                    <div className="paper-trading-title">Start with paper trading</div>
                    <div className="paper-trading-desc">Test your strategy with simulated funds. No deposit required &mdash; switch to live trading anytime.</div>
                  </div>
                  <button className="btn btn-secondary" id="paperTradeBtn">Paper trade &rarr;</button>
                </div>
              </div>
              <div className="wizard-card-footer">
                <div className="disclaimer">Non-custodial. You can withdraw or revoke access at any time.</div>
                <button className="btn btn-primary" data-next>Launch agent &rarr;</button>
              </div>
            </div>
          </section>

          {/* QR Modal */}
          <div className="qr-overlay" id="qrOverlay">
            <div className="qr-modal">
              <div className="qr-modal-header">
                <div className="qr-modal-title" id="qrTitle">Deposit</div>
                <button className="qr-close" id="qrClose">&times;</button>
              </div>
              <div className="qr-modal-body">
                <div className="qr-code" id="qrCode"></div>
                <div className="qr-address" id="qrAddress"></div>
                <button className="btn btn-secondary btn-sm qr-copy-btn" id="qrCopyBtn">Copy address</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
