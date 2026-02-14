// ============================================================
// Strategy Template Catalog
// ============================================================
// Shared template definitions for both Polymarket and Custom strategy types.
// Used by the thesis wizard frontend and the strategy service backend.

export interface DefaultAlertRule {
  triggerType: 'PRICE_THRESHOLD' | 'CRON_SCHEDULE' | 'POLYMARKET_ODDS';
  triggerConfig: Record<string, unknown>;
  instruction: string;
}

export interface StrategyTemplate {
  id: string;
  label: string;
  category: string;
  description: string;
  strategyType: 'POLYMARKET' | 'CUSTOM';
  defaultThesis: string;
  defaultAlertRules: DefaultAlertRule[];
}

// ============================================================
// Polymarket Templates — strategy patterns for prediction markets
// ============================================================

const polymarketTemplates: StrategyTemplate[] = [
  {
    id: 'attention-breakout',
    label: 'Trending story',
    category: 'Popular',
    description: 'Monitor narrative velocity and enter when attention spikes above baseline.',
    strategyType: 'POLYMARKET',
    defaultThesis: 'AI tokens are about to re-rate as funding + attention accelerate.',
    defaultAlertRules: [
      {
        triggerType: 'CRON_SCHEDULE',
        triggerConfig: { cron: '*/15 * * * *' },
        instruction:
          'Check X and crypto news for narrative velocity on AI tokens. If attention is >2σ above 30-day baseline, evaluate entry opportunities within policy limits.',
      },
      {
        triggerType: 'PRICE_THRESHOLD',
        triggerConfig: { asset: 'ETH', direction: 'above' as const, price: 0 },
        instruction:
          'Price threshold breached. Evaluate whether this confirms the attention breakout thesis and consider position adjustment.',
      },
    ],
  },
  {
    id: 'event-driven',
    label: 'Event catalyst',
    category: 'Events',
    description: 'Trade Polymarket mispricing around macro events with strict risk limits.',
    strategyType: 'POLYMARKET',
    defaultThesis:
      'Polymarket is mispricing the next macro event; I want to express that view with strict risk limits.',
    defaultAlertRules: [
      {
        triggerType: 'POLYMARKET_ODDS',
        triggerConfig: {
          conditionId: '',
          outcome: '',
          direction: 'above' as const,
          probability: 0.5,
        },
        instruction:
          'Polymarket odds shifted past threshold. Evaluate whether the market is mispricing this outcome and consider entering a position within policy limits.',
      },
    ],
  },
  {
    id: 'relative-strength',
    label: 'Relative strength',
    category: 'Market moves',
    description: 'Systematic entries when one asset shows momentum relative to another.',
    strategyType: 'POLYMARKET',
    defaultThesis: 'ETH momentum should outpace BTC as flows rotate; I want systematic entries.',
    defaultAlertRules: [
      {
        triggerType: 'PRICE_THRESHOLD',
        triggerConfig: { asset: 'ETH', direction: 'above' as const, price: 0 },
        instruction:
          'ETH price threshold breached. Check ETH/BTC ratio momentum and evaluate rotation trade if relative strength confirms.',
      },
      {
        triggerType: 'CRON_SCHEDULE',
        triggerConfig: { cron: '0 */4 * * *' },
        instruction:
          'Periodic check: compare ETH vs BTC 4h momentum. If ETH relative strength is rising, evaluate systematic entry.',
      },
    ],
  },
  {
    id: 'mean-reversion',
    label: 'Mean reversion',
    category: 'Market moves',
    description: 'Fade overextended moves with tight risk caps when price deviates from mean.',
    strategyType: 'POLYMARKET',
    defaultThesis: 'Overextended moves revert; I want to fade extremes with tight risk caps.',
    defaultAlertRules: [
      {
        triggerType: 'PRICE_THRESHOLD',
        triggerConfig: { asset: 'ETH', direction: 'below' as const, price: 0 },
        instruction:
          'Price dropped past threshold. Check if move is >2σ from 20-day mean. If overextended, evaluate mean-reversion entry with tight stop-loss.',
      },
    ],
  },
  {
    id: 'arbitrage',
    label: 'Basis / funding',
    category: 'Market structure',
    description: 'Capture basis trades when perps funding rate spikes.',
    strategyType: 'POLYMARKET',
    defaultThesis: 'Perps funding spikes create short-term basis trades with defined exits.',
    defaultAlertRules: [
      {
        triggerType: 'CRON_SCHEDULE',
        triggerConfig: { cron: '*/15 * * * *' },
        instruction:
          'Check perps funding rates across major venues. If funding >0.05% per 8h, evaluate basis trade opportunity with defined exit.',
      },
    ],
  },
  {
    id: 'breakout',
    label: 'Momentum breakout',
    category: 'Market moves',
    description: 'Enter breakouts confirmed by volume with structured entries and exits.',
    strategyType: 'POLYMARKET',
    defaultThesis:
      'Breakouts with volume confirmation tend to extend; I want structured entries and exits.',
    defaultAlertRules: [
      {
        triggerType: 'PRICE_THRESHOLD',
        triggerConfig: { asset: 'ETH', direction: 'above' as const, price: 0 },
        instruction:
          'Price broke above threshold. Confirm volume is >1.5x 20-day average. If confirmed breakout, enter with structured stop-loss and take-profit.',
      },
    ],
  },
  {
    id: 'sentiment-shift',
    label: 'Sentiment shift',
    category: 'Popular',
    description: 'Track narrative flips and enter when sentiment turns.',
    strategyType: 'POLYMARKET',
    defaultThesis: 'Narratives can flip quickly; I want alerts and entries when sentiment turns.',
    defaultAlertRules: [
      {
        triggerType: 'CRON_SCHEDULE',
        triggerConfig: { cron: '*/30 * * * *' },
        instruction:
          'Poll sentiment indicators: X engagement, Fear & Greed index, funding rates. If sentiment has shifted significantly from last check, evaluate repositioning.',
      },
    ],
  },
  {
    id: 'dev-activity',
    label: 'Developer momentum',
    category: 'Signals',
    description: 'Track sustained dev activity that tends to precede market attention.',
    strategyType: 'POLYMARKET',
    defaultThesis: 'Sustained dev activity tends to precede market attention; I want to track it.',
    defaultAlertRules: [
      {
        triggerType: 'CRON_SCHEDULE',
        triggerConfig: { cron: '0 */6 * * *' },
        instruction:
          'Check GitHub activity for tracked repos: stars, PRs merged, contributor count. If dev velocity is >2σ above baseline, flag as potential entry signal.',
      },
    ],
  },
  {
    id: 'risk-off',
    label: 'Risk on / risk off',
    category: 'Macro',
    description: 'Adjust positioning based on macro tone shifts.',
    strategyType: 'POLYMARKET',
    defaultThesis: 'Macro tone shifts should influence positioning with strict caps.',
    defaultAlertRules: [
      {
        triggerType: 'PRICE_THRESHOLD',
        triggerConfig: { asset: 'BTC', direction: 'below' as const, price: 0 },
        instruction:
          'BTC dropped below threshold, possible risk-off signal. Check DXY, yields, and equity indices. If macro tone is deteriorating, evaluate reducing exposure.',
      },
      {
        triggerType: 'CRON_SCHEDULE',
        triggerConfig: { cron: '0 9 * * *' },
        instruction:
          'Daily macro check: DXY, 10Y yield, S&P futures, BTC correlation. Classify regime as risk-on or risk-off and adjust positioning accordingly.',
      },
    ],
  },
  {
    id: 'dip-buying',
    label: 'Buy the dip (structured)',
    category: 'Market moves',
    description: 'Controlled dip-buying when volatility spikes.',
    strategyType: 'POLYMARKET',
    defaultThesis: 'Controlled dip-buying can improve entries when volatility spikes.',
    defaultAlertRules: [
      {
        triggerType: 'PRICE_THRESHOLD',
        triggerConfig: { asset: 'ETH', direction: 'below' as const, price: 0 },
        instruction:
          'Price dropped past dip threshold. Check if drop is >5% in 24h with elevated volume. If so, execute structured dip-buy with predefined position size.',
      },
    ],
  },
];

// ============================================================
// Custom Templates — crypto-native agent modes
// ============================================================

const customTemplates: StrategyTemplate[] = [
  {
    id: 'earn',
    label: 'Earn',
    category: 'Yield',
    description:
      'Yield farming, staking optimization, and LP management. Agent monitors APY/APR across protocols and rebalances positions to maximize risk-adjusted yield.',
    strategyType: 'CUSTOM',
    defaultThesis:
      'I want to maximize yield across DeFi protocols with automated rebalancing and impermanent loss protection.',
    defaultAlertRules: [
      {
        triggerType: 'CRON_SCHEDULE',
        triggerConfig: { cron: '0 */2 * * *' },
        instruction:
          'Check current yield positions: APY/APR on active farms, staking rewards, LP performance. If any position yield has dropped >20% from entry or a better opportunity exists with similar risk, recommend rebalancing.',
      },
      {
        triggerType: 'PRICE_THRESHOLD',
        triggerConfig: { asset: 'ETH', direction: 'below' as const, price: 0 },
        instruction:
          'Underlying asset price dropped. Check LP positions for impermanent loss exposure. If IL exceeds threshold, evaluate withdrawing or hedging.',
      },
    ],
  },
  {
    id: 'trencher',
    label: 'Trencher',
    category: 'Degen',
    description:
      'Narrative tokens, meme coins, and quick rotations. Agent monitors social signals and on-chain activity for early momentum plays with tight risk management.',
    strategyType: 'CUSTOM',
    defaultThesis:
      'I want to catch early narrative momentum in meme coins and trending tokens with strict position limits and fast exits.',
    defaultAlertRules: [
      {
        triggerType: 'CRON_SCHEDULE',
        triggerConfig: { cron: '*/10 * * * *' },
        instruction:
          'Scan for trending tokens: X mentions velocity, DEX volume spikes, new liquidity adds. If a token shows >3x normal activity with sufficient liquidity, flag as potential entry. Max position size per policy limits.',
      },
      {
        triggerType: 'PRICE_THRESHOLD',
        triggerConfig: { asset: '', direction: 'above' as const, price: 0 },
        instruction:
          'Token price hit take-profit threshold. Evaluate partial or full exit. Check if momentum is still accelerating before deciding.',
      },
    ],
  },
  {
    id: 'sniper',
    label: 'Sniper',
    category: 'Launch',
    description:
      'Token launch sniping and early entry on new deployments. Agent monitors pending launches and executes precisely timed entries with predefined limits.',
    strategyType: 'CUSTOM',
    defaultThesis:
      'I want to enter new token launches at the earliest opportunity with predefined size limits and immediate stop-losses.',
    defaultAlertRules: [
      {
        triggerType: 'CRON_SCHEDULE',
        triggerConfig: { cron: '*/5 * * * *' },
        instruction:
          'Monitor upcoming token launches: new pair creations on DEXs, announced launch times, liquidity pool deployments. If a tracked launch is imminent, prepare entry parameters within policy limits.',
      },
      {
        triggerType: 'PRICE_THRESHOLD',
        triggerConfig: { asset: '', direction: 'above' as const, price: 0 },
        instruction:
          'Launch token exceeded max entry price. Do not enter — the window has passed. Log and wait for next opportunity.',
      },
    ],
  },
];

// ============================================================
// Combined Catalog
// ============================================================

export const STRATEGY_TEMPLATES: StrategyTemplate[] = [...polymarketTemplates, ...customTemplates];

export function getTemplateById(templateId: string): StrategyTemplate | undefined {
  return STRATEGY_TEMPLATES.find((t) => t.id === templateId);
}

export function getTemplatesByType(strategyType: 'POLYMARKET' | 'CUSTOM'): StrategyTemplate[] {
  return STRATEGY_TEMPLATES.filter((t) => t.strategyType === strategyType);
}
