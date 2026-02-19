# Invision — Product Design Deliverables

## Context

Invision is a product built on Vincent infra where users deposit money into personality-specific vaults. An AI agent watches that personality's tweets and uses them to drive Polymarket bets. Think Morpho vaults but curated by Twitter personalities instead of DeFi strategists.

We need two deliverables to validate the concept:

1. **System architecture diagram** — how the product works end-to-end
2. **Mock frontend pages** — what the user sees (vault browser, vault detail with backtested results, deposit flow)

## Deliverable 1: Architecture Diagram

An HTML page using Mermaid.js rendering a system flow diagram showing:
- Twitter personalities as signal sources (Elon, Shams, Nate Silver)
- Tweet ingestion → LLM enrichment → market matching → trade execution pipeline
- Polymarket as the execution venue
- Vault structure (per-personality, user deposits, P&L distribution)
- Vincent as the backend infra (abstracted, not detailed)

Output: `mockups/architecture.html`

## Deliverable 2: Mock Frontend Pages

Interactive HTML/CSS mockups (no framework, static pages) styled like Morpho's dark UI. Pages:

### Page 1: Vault Browser (`vaults.html`)
- Header with Invision branding
- Five vault cards showing:
  - Personality avatar, name, handle
  - Category badge (Tech/Crypto, Sports, Politics, Trending Narratives, Counter-Consensus)
  - Backtested stats: total return %, win rate, Sharpe-like ratio, # trades
  - Current vault TVL (mock), depositors count
  - Sparkline or mini chart showing cumulative P&L over time
- "View Vault" CTA button on each card

### Page 2: Vault Detail — Elon Musk (`vault-elon.html`)
Shows what a user sees before/after depositing into Elon's vault:
- Vault header: personality info, total return, TVL, strategy description
- **Performance chart**: cumulative P&L curve over backtested period (mock data, SVG)
- **Stats grid**: total return, win rate, avg trade size, max drawdown, best trade, worst trade
- **Recent trades table**: date, market question, direction (YES/NO), entry price, exit price, P&L, status (won/lost/open)
- **Active positions**: currently open paper positions with live prices
- **Signal log**: recent tweets that triggered (or didn't trigger) trades, with the AI's reasoning
- Deposit widget (Morpho-style): amount input, projected returns, deposit button

### Page 3: Vault Detail — Shams Charania (`vault-shams.html`)
Same layout as Elon but with NBA-focused mock data:
- Trades on NBA markets (player trades, MVP race, championship odds)
- Different P&L profile (bursty around trade deadlines/free agency)

### Page 4: Vault Detail — Nate Silver (`vault-nate.html`)
Same layout but politics/elections focused:
- Trades on election markets, policy outcomes
- Steadier P&L profile (longer-horizon bets)

### Page 5: Vault Detail — Narrative Pulse (`vault-narrative.html`)
Strategy-based vault that follows trending topics across CT/news:
- Not tied to a single personality — aggregates signals from trending narratives
- Trades emerging narratives before they peak
- Diversified across politics, tech, crypto, and culture
- Cyan/emerald visual theme

### Page 6: Vault Detail — The Contrarian (`vault-contrarian.html`)
Sentiment-based vault that fades extreme crowd consensus:
- When Twitter consensus exceeds 80%, takes the other side
- Profits from mean reversion and overreaction
- Highest return (+31.5%) but lowest win rate (52%) and highest drawdown (-12.4%)
- Red/orange visual theme

## Mock Data

Realistic backtested data for each vault covering ~3 months:
- **Elon**: ~42 trades, 58% win rate, +22.4% return (volatile, some big wins on crypto/politics)
- **Shams**: ~25 trades, 68% win rate, +18.2% return (high accuracy on NBA insider info)
- **Nate**: ~15 trades, 60% win rate, +12.1% return (fewer but well-reasoned political bets)
- **Narrative Pulse**: ~34 trades, 62% win rate, +26.8% return (diversified narrative trading)
- **The Contrarian**: ~25 trades, 52% win rate, +31.5% return (high risk/reward, fading consensus)

Each vault has 7-8 example trades with real-sounding Polymarket market questions.

## Style

- Dark theme matching existing VinxPoly leaderboard (--bg: #0a0a0f, --surface: #12121a, etc.)
- Morpho-inspired layout: clean cards, minimal borders, data-dense but readable
- Responsive (works on mobile)
- Inter or system font stack

## File Structure

```
plans/invision/
├── plan.md                       — This file
└── mockups/
    ├── architecture.html         — System diagram (Mermaid.js)
    ├── vaults.html               — Vault browser (5 cards)
    ├── vault-elon.html           — Elon vault detail + backtested results
    ├── vault-shams.html          — Shams vault detail
    ├── vault-nate.html           — Nate Silver vault detail
    ├── vault-narrative.html      — Narrative Pulse vault detail
    └── vault-contrarian.html     — The Contrarian vault detail
```

## Aggregate Stats

- **Total TVL**: $3.7M across all vaults
- **Total Depositors**: 1,317
- **Average Return**: +22.2%

## Verification

Open each HTML file in a browser — they should render fully self-contained (inline CSS/JS, no external deps except Mermaid CDN for the diagram).
