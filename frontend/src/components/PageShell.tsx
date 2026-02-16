import { useEffect, useRef, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';

const CheckSvg = () => (
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
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const ChevronDown = ({ size = 16 }: { size?: number }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
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

export { CheckSvg, ChevronDown };

export const SHARED_STYLES = `
  :root {
    --bg: #0d1117;
    --bg-alt: #0a0e13;
    --surface: #161b22;
    --surface-hover: #1c2129;
    --border: #30363d;
    --border-light: #21262d;
    --text: #e6edf3;
    --text-muted: #8b949e;
    --text-dim: #484f58;
    --accent: #8b5cf6;
    --accent-hover: #7c3aed;
    --accent-light: #c4b5fd;
    --accent-glow: rgba(139, 92, 246, 0.15);
    --accent-glow-strong: rgba(139, 92, 246, 0.3);
    --font-mono: 'SF Mono', 'Fira Code', Menlo, Consolas, monospace;
    --max-width: 1200px;
    --radius: 12px;
    --radius-sm: 8px;
    --radius-lg: 16px;
  }

  .vp *, .vp *::before, .vp *::after { box-sizing: border-box; margin: 0; padding: 0; }
  .vp {
    min-height: 100vh;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    background-color: var(--bg);
    background-image: radial-gradient(circle at 1px 1px, rgba(255,255,255,0.03) 1px, transparent 0);
    background-size: 32px 32px;
    color: var(--text);
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
    overflow-x: hidden;
  }
  .vp img { display: block; max-width: 100%; }
  .vp a { color: inherit; text-decoration: none; }
  .vp button { font: inherit; cursor: pointer; border: none; background: none; color: inherit; }
  .vp ul, .vp ol { list-style: none; }
  .vp h1, .vp h2, .vp h3, .vp h4 { line-height: 1.15; font-weight: 700; color: var(--text); }
  .vp h1 { font-size: 3.25rem; letter-spacing: -0.03em; }
  .vp h2 { font-size: 2.25rem; letter-spacing: -0.02em; }
  .vp h3 { font-size: 1.25rem; letter-spacing: -0.01em; }
  .vp p { color: var(--text-muted); }

  .vp .container { max-width: var(--max-width); margin: 0 auto; padding: 0 1.5rem; }
  .vp .container-narrow { max-width: 800px; margin: 0 auto; padding: 0 1.5rem; }

  /* Nav */
  .vp .nav {
    position: fixed; top: 0; left: 0; right: 0; z-index: 100;
    height: 72px; display: flex; align-items: center;
    transition: background 250ms ease, border-color 250ms ease;
    border-bottom: 1px solid transparent;
    background: rgba(13, 17, 23, 0.85);
    backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
    border-bottom-color: var(--border);
  }
  .vp .nav .container { display: flex; align-items: center; justify-content: space-between; width: 100%; }
  .vp .nav__logo { font-size: 1.25rem; font-weight: 700; display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0; }
  .vp .nav__logo-img { height: 28px; width: auto; filter: invert(1); opacity: .9; }
  .vp .nav__tabs { display: flex; justify-content: center; gap: 0.25rem; flex: 1; min-width: 0; }
  .vp .nav__tab {
    padding: 0.5rem 1rem; font-size: 0.9375rem; font-weight: 500; color: var(--text-muted);
    border-radius: var(--radius-sm); transition: color 150ms ease, background 150ms ease; position: relative;
  }
  .vp .nav__tab:hover { color: var(--text); background: rgba(255,255,255,0.04); }
  .vp .nav__tab--active { color: var(--text); }
  .vp .nav__tab--active::after {
    content: ''; position: absolute; bottom: -1px; left: 1rem; right: 1rem;
    height: 2px; background: var(--accent); border-radius: 1px;
  }
  .vp .nav__right { display: flex; align-items: center; gap: 0.75rem; flex-shrink: 0; }

  /* Buttons */
  .vp .btn {
    display: inline-flex; align-items: center; gap: 0.5rem;
    padding: 0.5rem 1rem; border-radius: var(--radius-sm);
    font-weight: 600; font-size: 0.875rem; transition: all 150ms ease; white-space: nowrap;
  }
  .vp .btn-primary { background: var(--accent); color: #fff; }
  .vp .btn-primary:hover { background: var(--accent-hover); box-shadow: 0 0 24px var(--accent-glow-strong); }
  .vp .btn-secondary { background: transparent; color: var(--text); border: 1px solid var(--border); }
  .vp .btn-secondary:hover { border-color: var(--accent); color: var(--accent-light); }
  .vp .btn-lg { padding: 0.75rem 1.5rem; font-size: 1rem; }

  /* Sections */
  .vp .section { padding: 6rem 0; }
  .vp .section--alt {
    background-color: var(--bg-alt);
    background-image: radial-gradient(circle at 1px 1px, rgba(255,255,255,0.025) 1px, transparent 0);
    background-size: 32px 32px;
  }
  .vp .section-label {
    display: inline-block; font-size: 0.8125rem; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.08em; color: var(--accent); margin-bottom: 1rem;
  }
  .vp .section-header { text-align: center; margin-bottom: 3.5rem; }
  .vp .section-header p { max-width: 640px; margin: 1rem auto 0; font-size: 1.125rem; }

  /* Cards */
  .vp .card {
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
    padding: 2rem; transition: border-color 150ms ease, transform 150ms ease;
  }
  .vp .card:hover { border-color: var(--border-light); transform: translateY(-2px); }
  .vp .card-icon {
    width: 48px; height: 48px; border-radius: 50%;
    background: var(--accent-glow); display: flex; align-items: center; justify-content: center;
    margin-bottom: 1.25rem; color: var(--accent);
  }
  .vp .card-icon svg { width: 24px; height: 24px; }
  .vp .card h3 { margin-bottom: 0.75rem; }
  .vp .card p { font-size: 0.9375rem; line-height: 1.65; }

  /* Page hero (Features/Security) */
  .vp .page-hero { padding: 8rem 0 4rem; text-align: center; position: relative; overflow: hidden; }
  .vp .page-hero .container { position: relative; z-index: 1; }
  .vp .page-hero h1 { max-width: 700px; margin: 0 auto 1rem; }
  .vp .page-hero p { max-width: 600px; margin: 0 auto; font-size: 1.125rem; }

  /* Hero (home) */
  .vp .hero { padding: 10rem 0 5rem; text-align: center; position: relative; overflow: hidden; }
  .vp .hero::before {
    content: ''; position: absolute; top: 0; left: 50%; transform: translateX(-50%);
    width: 800px; height: 600px;
    background: radial-gradient(ellipse at 50% 30%, rgba(139,92,246,0.08) 0%, transparent 70%);
    pointer-events: none;
  }
  .vp .hero .container { position: relative; z-index: 1; }
  .vp .hero__badge {
    display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.375rem 1rem;
    border: 1px solid var(--accent); border-radius: 999px; font-size: 0.8125rem; font-weight: 600;
    color: var(--accent); background: var(--accent-glow); margin-bottom: 2rem;
  }
  .vp .hero h1 { max-width: 800px; margin: 0 auto 1.5rem; }
  .vp .hero h1 em { font-style: normal; color: var(--accent); }
  .vp .hero > .container > p { max-width: 640px; margin: 0 auto 2.5rem; font-size: 1.25rem; }
  .vp .hero__paths { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; max-width: 700px; margin: 0 auto 3rem; }
  .vp .hero__path {
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
    padding: 2rem; text-align: left; transition: border-color 150ms ease;
  }
  .vp .hero__path:hover { border-color: var(--accent); }
  .vp .hero__path h3 { margin-bottom: 0.5rem; font-size: 1.125rem; }
  .vp .hero__path p { font-size: 0.875rem; margin-bottom: 1.25rem; }
  .vp .hero__path .btn { width: 100%; justify-content: center; }

  /* Steps */
  .vp .steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2rem; position: relative; }
  .vp .steps::before {
    content: ''; position: absolute; top: 36px; left: calc(16.66% + 1rem); right: calc(16.66% + 1rem);
    height: 2px; background: var(--border);
  }
  .vp .step { text-align: center; position: relative; }
  .vp .step__number {
    width: 72px; height: 72px; border-radius: 50%; background: var(--surface);
    border: 2px solid var(--border); display: flex; align-items: center; justify-content: center;
    margin: 0 auto 1.5rem; font-size: 1.5rem; font-weight: 700; color: var(--accent);
    position: relative; z-index: 1;
  }
  .vp .step h3 { margin-bottom: 0.5rem; }
  .vp .step p { font-size: 0.9375rem; max-width: 280px; margin: 0 auto; }

  /* Use cases */
  .vp .use-cases-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.5rem; }
  .vp .use-case-card {
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
    padding: 2rem; transition: border-color 150ms ease, transform 150ms ease;
    position: relative; overflow: hidden;
  }
  .vp .use-case-card::before {
    content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
    background: linear-gradient(90deg, var(--accent), var(--accent-light));
  }
  .vp .use-case-card:hover { border-color: var(--border-light); transform: translateY(-2px); }
  .vp .use-case-card h3 { margin-bottom: 0.75rem; }
  .vp .use-case-card ul { margin-bottom: 1.5rem; display: flex; flex-direction: column; gap: 0.5rem; }
  .vp .use-case-card li { font-size: 0.875rem; color: var(--text-muted); display: flex; align-items: center; gap: 0.5rem; }
  .vp .use-case-card li svg { width: 16px; height: 16px; color: var(--accent); flex-shrink: 0; }

  /* Feature highlights (home) */
  .vp .highlights-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1.5rem; margin-bottom: 2rem; }
  .vp .highlight {
    text-align: center; padding: 2rem 1.5rem; background: var(--surface);
    border: 1px solid var(--border); border-radius: var(--radius);
  }
  .vp .highlight .card-icon { margin: 0 auto 1rem; }
  .vp .highlight h3 { font-size: 1rem; margin-bottom: 0.5rem; }
  .vp .highlight p { font-size: 0.8125rem; }
  .vp .section-link {
    display: inline-flex; align-items: center; gap: 0.375rem; color: var(--accent);
    font-weight: 600; font-size: 0.9375rem; transition: gap 150ms ease;
  }
  .vp .section-link:hover { gap: 0.625rem; }
  .vp .section-link svg { width: 18px; height: 18px; }

  /* Pricing */
  .vp .pricing-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1.5rem; align-items: stretch; }
  .vp .pricing-card {
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg);
    padding: 2.5rem 2rem; position: relative; display: flex; flex-direction: column;
  }
  .vp .pricing-card--featured { border-color: var(--accent); box-shadow: 0 0 40px var(--accent-glow); }
  .vp .pricing-card__badge {
    position: absolute; top: -12px; left: 50%; transform: translateX(-50%);
    padding: 0.25rem 1rem; background: var(--accent); color: #fff;
    font-size: 0.75rem; font-weight: 700; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.05em;
  }
  .vp .pricing-card h3 { font-size: 1.25rem; margin-bottom: 0.5rem; }
  .vp .pricing-card__price { font-size: 3rem; font-weight: 700; color: var(--text); line-height: 1; margin-bottom: 0.25rem; }
  .vp .pricing-card__price span { font-size: 1rem; font-weight: 400; color: var(--text-muted); }
  .vp .pricing-card__desc { font-size: 0.875rem; color: var(--text-muted); margin-bottom: 2rem; }
  .vp .pricing-card__features { display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 2rem; flex: 1; }
  .vp .pricing-card__features li {
    display: flex; align-items: center; gap: 0.5rem; font-size: 0.9375rem; color: var(--text-muted);
  }
  .vp .pricing-card__features li svg { width: 18px; height: 18px; color: var(--accent); flex-shrink: 0; }
  .vp .pricing-card .btn { width: 100%; justify-content: center; margin-top: auto; }

  /* FAQ */
  .vp .faq-list { display: flex; flex-direction: column; }
  .vp .faq-item { border-bottom: 1px solid var(--border); }
  .vp .faq-item:first-child { border-top: 1px solid var(--border); }
  .vp .faq-question {
    width: 100%; display: flex; align-items: center; justify-content: space-between;
    padding: 1.25rem 0; font-size: 1.0625rem; font-weight: 500; color: var(--text);
    text-align: left; transition: color 150ms ease;
  }
  .vp .faq-question:hover { color: var(--accent-light); }
  .vp .faq-question svg { width: 20px; height: 20px; color: var(--text-muted); transition: transform 250ms ease; flex-shrink: 0; margin-left: 1rem; }
  .vp .faq-item--open .faq-question svg { transform: rotate(180deg); }
  .vp .faq-item--open .faq-question { color: var(--accent-light); }
  .vp .faq-answer { padding: 0 0 1.25rem; font-size: 0.9375rem; color: var(--text-muted); line-height: 1.7; }

  /* Footer CTA */
  .vp .footer-cta { padding: 6rem 0; text-align: center; position: relative; overflow: hidden; }
  .vp .footer-cta::before {
    content: ''; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: 600px; height: 400px;
    background: radial-gradient(ellipse at 50% 50%, rgba(139,92,246,0.06) 0%, transparent 70%);
    pointer-events: none;
  }
  .vp .footer-cta .container { position: relative; z-index: 1; }
  .vp .footer-cta h2 { margin-bottom: 1rem; }
  .vp .footer-cta p { margin-bottom: 2rem; font-size: 1.125rem; }
  .vp .cta-buttons { display: flex; align-items: center; justify-content: center; gap: 1rem; flex-wrap: wrap; }

  /* Footer */
  .vp .site-footer { border-top: 1px solid var(--border); padding: 4rem 0 2rem; }
  .vp .footer-grid { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 3rem; margin-bottom: 3rem; }
  .vp .footer-brand p { font-size: 0.875rem; margin: 0.75rem 0 1.25rem; }
  .vp .footer-brand .nav__logo-img { height: 24px; }
  .vp .footer-col h4 {
    font-size: 0.8125rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em;
    color: var(--text); margin-bottom: 1rem;
  }
  .vp .footer-col ul { display: flex; flex-direction: column; gap: 0.625rem; }
  .vp .footer-col a { font-size: 0.875rem; color: var(--text-muted); transition: color 150ms ease; }
  .vp .footer-col a:hover { color: var(--text); }
  .vp .footer-bottom {
    padding-top: 2rem; border-top: 1px solid var(--border);
    display: flex; justify-content: space-between; font-size: 0.8125rem; color: var(--text-dim);
  }

  /* Feature sections (features page) */
  .vp .feature-section { display: grid; grid-template-columns: 1fr 1fr; gap: 4rem; align-items: center; }
  .vp .feature-section--reverse { direction: rtl; }
  .vp .feature-section--reverse > * { direction: ltr; }
  .vp .feature-section__content .section-label { margin-bottom: 0.75rem; }
  .vp .feature-section__content h2 { font-size: 1.75rem; margin-bottom: 1rem; }
  .vp .feature-section__content p { font-size: 1rem; line-height: 1.7; margin-bottom: 1.5rem; }
  .vp .feature-section__content ul { display: flex; flex-direction: column; gap: 0.625rem; }
  .vp .feature-section__content li {
    display: flex; align-items: flex-start; gap: 0.5rem; font-size: 0.9375rem; color: var(--text-muted);
  }
  .vp .feature-section__content li svg { width: 18px; height: 18px; color: var(--accent); flex-shrink: 0; margin-top: 2px; }
  .vp .feature-section__visual {
    min-height: 300px; background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius-lg); display: flex; align-items: center; justify-content: center;
    color: var(--text-dim); font-size: 0.875rem; overflow: hidden;
  }

  /* Architecture diagram */
  .vp .arch-diagram { max-width: 500px; margin: 0 auto; display: flex; flex-direction: column; align-items: center; gap: 0; }
  .vp .arch-box { width: 100%; padding: 1.5rem 2rem; border-radius: var(--radius); background: var(--surface); text-align: center; }
  .vp .arch-box h4 { margin-bottom: 0.25rem; }
  .vp .arch-box p { font-size: 0.8125rem; }
  .vp .arch-tags { display: flex; gap: 0.5rem; justify-content: center; margin-top: 0.5rem; flex-wrap: wrap; }
  .vp .arch-tag {
    font-size: 0.75rem; padding: 0.125rem 0.5rem; border-radius: 999px;
    background: rgba(255,255,255,0.05); color: var(--text-muted); font-family: var(--font-mono);
  }
  .vp .arch-box--runtime { border: 2px dashed var(--accent); }
  .vp .arch-box--mediator { border: 1px solid var(--border); }
  .vp .arch-box--vault { border: 2px solid var(--accent); box-shadow: 0 0 30px var(--accent-glow); }
  .vp .arch-label { color: var(--accent); font-weight: 600; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; }
  .vp .arch-arrow { display: flex; flex-direction: column; align-items: center; padding: 0.75rem 0; color: var(--text-dim); font-size: 0.75rem; }
  .vp .arch-arrow__line { width: 2px; height: 24px; background: var(--border); }
  .vp .arch-arrow__label { margin: 0.375rem 0; font-family: var(--font-mono); }

  /* Diagram: horizontal arrow */
  .vp .arch-arrow--horizontal { flex-direction: row; padding: 0 0.5rem; }
  .vp .arch-arrow--horizontal .arch-arrow__line { width: 24px; height: 2px; }

  /* Diagram: composability connector */
  .vp .diagram-compose { color: var(--accent); font-weight: 700; font-size: 1.25rem; padding: 0.25rem 0; }

  /* Diagram: flow row (horizontal layout) */
  .vp .diagram-flow-row { display: flex; gap: 0.75rem; justify-content: center; align-items: center; width: 100%; }
  .vp .diagram-flow-row .arch-box { flex: 1; padding: 1rem; }

  /* Diagram: status indicators */
  .vp .diagram-status { display: inline-flex; align-items: center; gap: 0.375rem; font-family: var(--font-mono); font-size: 0.8125rem; }
  .vp .diagram-status--green { color: #22c55e; }
  .vp .diagram-status--orange { color: var(--accent); }
  .vp .diagram-status--dim { color: var(--text-dim); }

  /* Diagram: role matrix */
  .vp .diagram-matrix { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 0.8125rem; font-family: var(--font-mono); }
  .vp .diagram-matrix th, .vp .diagram-matrix td {
    padding: 0.75rem 0.5rem; text-align: center; border-bottom: 1px solid var(--border);
  }
  .vp .diagram-matrix th { color: var(--text-muted); font-weight: 600; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; }
  .vp .diagram-matrix td:first-child, .vp .diagram-matrix th:first-child { text-align: left; color: var(--text); font-weight: 600; }
  .vp .diagram-matrix tr:last-child td { border-bottom: none; }
  .vp .diagram-matrix .matrix-check { color: var(--accent); font-weight: 700; }
  .vp .diagram-matrix .matrix-dash { color: var(--text-dim); }

  /* Diagram: audit log */
  .vp .diagram-log {
    width: 100%; padding: 1.25rem 1.5rem; background: var(--bg); border: 1px solid var(--border);
    border-radius: var(--radius); font-family: var(--font-mono); font-size: 0.75rem; line-height: 2;
    overflow-x: auto;
  }
  .vp .diagram-log__header {
    display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; padding-bottom: 0.75rem;
    border-bottom: 1px solid var(--border);
  }
  .vp .diagram-log__dot { width: 8px; height: 8px; border-radius: 50%; }
  .vp .diagram-log__dot--red { background: #ef4444; }
  .vp .diagram-log__dot--yellow { background: #eab308; }
  .vp .diagram-log__dot--green { background: #22c55e; }
  .vp .diagram-log__entry { display: flex; gap: 0.75rem; white-space: nowrap; }
  .vp .diagram-log__time { color: var(--text-dim); }
  .vp .diagram-log__type { font-weight: 600; min-width: 80px; }
  .vp .diagram-log__type--request { color: var(--accent); }
  .vp .diagram-log__type--policy { color: var(--text-muted); }
  .vp .diagram-log__type--approved { color: #22c55e; }
  .vp .diagram-log__type--executed { color: #22c55e; }
  .vp .diagram-log__msg { color: var(--text-muted); }

  /* Diagram: code/config block */
  .vp .diagram-code {
    width: 100%; padding: 1.25rem 1.5rem; background: var(--bg); border: 1px solid var(--border);
    border-radius: var(--radius); font-family: var(--font-mono); font-size: 0.8125rem; line-height: 1.8;
    overflow-x: auto;
  }
  .vp .diagram-code__header {
    display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; padding-bottom: 0.75rem;
    border-bottom: 1px solid var(--border); font-size: 0.75rem; color: var(--text-muted);
  }
  .vp .diagram-code__key { color: var(--accent); }
  .vp .diagram-code__val { color: var(--text-muted); }
  .vp .diagram-code__comment { color: var(--text-dim); }
  .vp .diagram-code__line { white-space: pre; }
  .vp .diagram-code__check { color: #22c55e; }

  /* Threat model */
  .vp .threat-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1.5rem; }
  .vp .threat-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 1.5rem; }
  .vp .threat-card__attack {
    display: flex; align-items: center; gap: 0.5rem; font-size: 0.9375rem; font-weight: 600;
    color: var(--text); margin-bottom: 0.5rem;
  }
  .vp .threat-card__attack svg { width: 18px; height: 18px; color: var(--accent); }
  .vp .threat-card__result { font-size: 0.875rem; color: var(--text-muted); display: flex; align-items: flex-start; gap: 0.5rem; }
  .vp .threat-card__result svg { width: 16px; height: 16px; color: #22c55e; flex-shrink: 0; margin-top: 2px; }

  /* Security split */
  .vp .security-split { display: grid; grid-template-columns: 1fr 1fr; gap: 4rem; align-items: start; }
  .vp .security-points { display: flex; flex-direction: column; gap: 2rem; }
  .vp .security-point { display: flex; gap: 1rem; }
  .vp .security-point .card-icon { flex-shrink: 0; width: 40px; height: 40px; margin-bottom: 0; }
  .vp .security-point .card-icon svg { width: 20px; height: 20px; }
  .vp .security-point h3 { margin-bottom: 0.375rem; font-size: 1.0625rem; }
  .vp .security-point p { font-size: 0.9375rem; }

  /* Trust comparison */
  .vp .trust-compare { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
  .vp .trust-box { padding: 2rem; border-radius: var(--radius); border: 1px solid var(--border); }
  .vp .trust-box--old { background: rgba(239,68,68,0.03); border-color: rgba(239,68,68,0.2); }
  .vp .trust-box--new { background: var(--accent-glow); border-color: var(--accent); }
  .vp .trust-box h3 { font-size: 1rem; margin-bottom: 0.75rem; }
  .vp .trust-box p { font-size: 0.875rem; line-height: 1.7; }
  .vp .trust-box ul { display: flex; flex-direction: column; gap: 0.5rem; margin-top: 1rem; }
  .vp .trust-box li { font-size: 0.875rem; color: var(--text-muted); display: flex; align-items: center; gap: 0.5rem; }
  .vp .trust-box li svg { width: 16px; height: 16px; flex-shrink: 0; }
  .vp .trust-box--old li svg { color: #ef4444; }
  .vp .trust-box--new li svg { color: #22c55e; }

  /* Animations */
  @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
  .vp .anim { animation: fadeInUp 0.6s ease both; }
  .vp .anim-d1 { animation-delay: 0.1s; }
  .vp .anim-d2 { animation-delay: 0.2s; }
  .vp .anim-d3 { animation-delay: 0.3s; }

  /* Responsive */
  @media (max-width: 1023px) {
    .vp .highlights-grid { grid-template-columns: repeat(2, 1fr); }
    .vp .use-cases-grid { grid-template-columns: 1fr; }
  }
  @media (max-width: 767px) {
    .vp h1 { font-size: 2.25rem; }
    .vp h2 { font-size: 1.75rem; }
    .vp .nav__tabs, .vp .nav__right .btn-secondary { display: none; }
    .vp .hero { padding: 8rem 0 3rem; }
    .vp .hero > .container > p { font-size: 1.0625rem; }
    .vp .hero__paths { grid-template-columns: 1fr; }
    .vp .steps { grid-template-columns: 1fr; gap: 3rem; }
    .vp .steps::before { display: none; }
    .vp .pricing-grid { grid-template-columns: 1fr; max-width: 420px; margin: 0 auto; }
    .vp .pricing-card--featured { order: -1; }
    .vp .feature-section, .vp .feature-section--reverse { grid-template-columns: 1fr; gap: 2rem; direction: ltr; }
    .vp .security-split { grid-template-columns: 1fr; gap: 3rem; }
    .vp .page-hero { padding: 6rem 0 3rem; }
    .vp .footer-grid { grid-template-columns: 1fr 1fr; }
    .vp .footer-brand { grid-column: 1 / -1; }
    .vp .footer-bottom { flex-direction: column; gap: 0.5rem; }
    .vp .section { padding: 4rem 0; }
  }
  @media (max-width: 639px) {
    .vp .highlights-grid { grid-template-columns: 1fr; }
    .vp .threat-grid { grid-template-columns: 1fr; }
    .vp .trust-compare { grid-template-columns: 1fr; }
    .vp .footer-grid { grid-template-columns: 1fr; }
  }
  @media (prefers-reduced-motion: reduce) {
    .vp *, .vp *::before, .vp *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
  }
`;

function Nav({ active }: { active: 'home' | 'features' | 'security' | 'skills' }) {
  return (
    <header className="nav" role="banner">
      <div className="container">
        <Link className="nav__logo" to="/">
          <img src="/vincent-logo.svg" alt="Vincent" className="nav__logo-img" />
        </Link>
        <nav className="nav__tabs" role="navigation" aria-label="Main navigation">
          <Link className={`nav__tab ${active === 'home' ? 'nav__tab--active' : ''}`} to="/">
            Home
          </Link>
          <Link
            className={`nav__tab ${active === 'features' ? 'nav__tab--active' : ''}`}
            to="/features"
          >
            Features
          </Link>
          <Link
            className={`nav__tab ${active === 'security' ? 'nav__tab--active' : ''}`}
            to="/security"
          >
            Security
          </Link>
          <Link
            className={`nav__tab ${active === 'skills' ? 'nav__tab--active' : ''}`}
            to="/skills"
          >
            Skills
          </Link>
        </nav>
        <div className="nav__right">
          <Link className="btn btn-secondary" to="/skills">
            Skills Only
          </Link>
          <Link className="btn btn-primary" to="/login">
            Human Login
          </Link>
        </div>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <>
      <section className="footer-cta">
        <div className="container">
          <h2>Ready to deploy your agent?</h2>
          <p>Start free. No credit card required.</p>
          <div className="cta-buttons">
            <Link className="btn btn-primary btn-lg" to="/login">
              Deploy an Agent
            </Link>
            <Link className="btn btn-secondary btn-lg" to="/skills">
              Skills Only
            </Link>
          </div>
        </div>
      </section>
      <footer className="site-footer">
        <div className="container">
          <div className="footer-grid">
            <div className="footer-brand">
              <div className="nav__logo">
                <img src="/vincent-logo.svg" alt="Vincent" className="nav__logo-img" />
              </div>
              <p>Self-improving AI agents, safe for money</p>
            </div>
            <div className="footer-col">
              <h4>Product</h4>
              <ul>
                <li>
                  <Link to="/features">Features</Link>
                </li>
                <li>
                  <Link to="/security">Security</Link>
                </li>
                <li>
                  <Link to="/#pricing">Pricing</Link>
                </li>
                <li>
                  <Link to="/#how-it-works">How It Works</Link>
                </li>
              </ul>
            </div>
            <div className="footer-col">
              <h4>Resources</h4>
              <ul>
                <li>
                  <Link to="/skills">Skills</Link>
                </li>
                <li>
                  <a href="/docs">Agent API Docs</a>
                </li>
                <li>
                  <a href="https://discord.gg/WVcQRJsNdv" target="_blank" rel="noreferrer">
                    Discord
                  </a>
                </li>
                <li>
                  <a href="mailto:support@litprotocol.com">Support</a>
                </li>
              </ul>
            </div>
            <div className="footer-col">
              <h4>Company</h4>
              <ul>
                <li>
                  <a href="https://litprotocol.com" target="_blank" rel="noreferrer">
                    Lit Protocol
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="footer-bottom">
            <span>&copy; {new Date().getFullYear()} Vincent. All rights reserved.</span>
            <span>
              <Link to="/terms">Terms of Service</Link>
            </span>
          </div>
        </div>
      </footer>
    </>
  );
}

export default function PageShell({
  active,
  children,
}: {
  active: 'home' | 'features' | 'security' | 'skills';
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Scroll to top on route change
  const location = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <>
      <style>{SHARED_STYLES}</style>
      <div className="vp" ref={ref}>
        <Nav active={active} />
        <main>{children}</main>
        <Footer />
      </div>
    </>
  );
}
