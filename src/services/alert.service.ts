import prisma from '../db/client.js';
import { getTokenPriceUsd } from './price.service.js';
import { OPENCLAW_PORT } from './openclaw.service.js';
import { markAlertTriggered } from './strategy.service.js';

// ============================================================
// Asset → CoinGecko ID mapping
// ============================================================

const ASSET_TO_COINGECKO: Record<string, string> = {
  eth: 'ethereum',
  btc: 'bitcoin',
  sol: 'solana',
  matic: 'polygon',
  avax: 'avalanche-2',
  bnb: 'binancecoin',
  doge: 'dogecoin',
  link: 'chainlink',
  uni: 'uniswap',
  aave: 'aave',
  arb: 'arbitrum',
  op: 'optimism',
};

function resolveAssetId(asset: string): string | null {
  const lower = asset.toLowerCase();
  return ASSET_TO_COINGECKO[lower] || null;
}

// ============================================================
// Cron Matching
// ============================================================

// Simple cron evaluator: checks if "now" matches a standard 5-field cron expression
// Fields: minute hour day-of-month month day-of-week
function cronMatchesNow(cronExpr: string, now: Date): boolean {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const values = [
    now.getMinutes(), // 0-59
    now.getHours(), // 0-23
    now.getDate(), // 1-31
    now.getMonth() + 1, // 1-12
    now.getDay(), // 0-6 (Sunday=0)
  ];

  return parts.every((field, i) => fieldMatches(field, values[i]));
}

function fieldMatches(field: string, value: number): boolean {
  if (field === '*') return true;

  // Handle step values: */N or range/N
  if (field.includes('/')) {
    const [rangeStr, stepStr] = field.split('/');
    const step = parseInt(stepStr, 10);
    if (isNaN(step) || step <= 0) return false;

    if (rangeStr === '*') {
      return value % step === 0;
    }
    // Range with step: e.g. 1-30/5
    const range = parseRange(rangeStr);
    if (!range) return false;
    if (value < range.start || value > range.end) return false;
    return (value - range.start) % step === 0;
  }

  // Handle comma-separated values
  if (field.includes(',')) {
    return field.split(',').some((part) => fieldMatches(part.trim(), value));
  }

  // Handle ranges: e.g. 1-5
  if (field.includes('-')) {
    const range = parseRange(field);
    if (!range) return false;
    return value >= range.start && value <= range.end;
  }

  // Plain number
  return parseInt(field, 10) === value;
}

function parseRange(rangeStr: string): { start: number; end: number } | null {
  const [startStr, endStr] = rangeStr.split('-');
  const start = parseInt(startStr, 10);
  const end = parseInt(endStr, 10);
  if (isNaN(start) || isNaN(end)) return null;
  return { start, end };
}

// ============================================================
// Trigger Evaluators
// ============================================================

async function evaluateCronTrigger(
  triggerConfig: Record<string, unknown>,
  lastTriggeredAt: Date | null
): Promise<boolean> {
  const cron = triggerConfig.cron as string;
  if (!cron) return false;

  const now = new Date();

  // Don't re-trigger within the same minute
  if (lastTriggeredAt) {
    const diffMs = now.getTime() - lastTriggeredAt.getTime();
    if (diffMs < 60_000) return false;
  }

  return cronMatchesNow(cron, now);
}

async function evaluatePriceThreshold(
  triggerConfig: Record<string, unknown>,
  lastTriggeredAt: Date | null
): Promise<boolean> {
  const asset = triggerConfig.asset as string;
  const direction = triggerConfig.direction as string;
  const targetPrice = triggerConfig.price as number;

  if (!asset || !direction || targetPrice === undefined || targetPrice === 0) return false;

  // Cooldown: don't re-trigger within 5 minutes for price alerts
  if (lastTriggeredAt) {
    const diffMs = Date.now() - lastTriggeredAt.getTime();
    if (diffMs < 5 * 60_000) return false;
  }

  const coinGeckoId = resolveAssetId(asset);
  if (!coinGeckoId) return false;

  try {
    const currentPrice = await getTokenPriceUsd(coinGeckoId);
    if (direction === 'above') return currentPrice >= targetPrice;
    if (direction === 'below') return currentPrice <= targetPrice;
  } catch {
    // Price fetch failed — skip this cycle
  }

  return false;
}

async function evaluatePolymarketOdds(
  triggerConfig: Record<string, unknown>,
  lastTriggeredAt: Date | null
): Promise<boolean> {
  const conditionId = triggerConfig.conditionId as string;
  const outcome = triggerConfig.outcome as string;
  const direction = triggerConfig.direction as string;
  const targetProb = triggerConfig.probability as number;

  if (!conditionId || !outcome || !direction || targetProb === undefined) return false;

  // Cooldown: 5 minutes
  if (lastTriggeredAt) {
    const diffMs = Date.now() - lastTriggeredAt.getTime();
    if (diffMs < 5 * 60_000) return false;
  }

  // Fetch current odds from Polymarket CLOB API
  try {
    const res = await fetch(`https://clob.polymarket.com/prices?token_ids=${conditionId}`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return false;

    const data = (await res.json()) as Record<string, number>;
    const currentProb = data[conditionId];
    if (currentProb === undefined) return false;

    if (direction === 'above') return currentProb >= targetProb;
    if (direction === 'below') return currentProb <= targetProb;
  } catch {
    // API error — skip
  }

  return false;
}

// ============================================================
// Agent Communication
// ============================================================

async function sendInstructionToAgent(
  ipAddress: string,
  accessToken: string,
  instruction: string,
  strategyContext: { strategyType: string; riskProfile: string; thesisText: string }
): Promise<{ success: boolean; error?: string }> {
  const message = [
    `[ALERT TRIGGERED] Execute the following instruction within your strategy context:`,
    ``,
    `Strategy type: ${strategyContext.strategyType}`,
    `Risk profile: ${strategyContext.riskProfile}`,
    `Thesis: ${strategyContext.thesisText}`,
    ``,
    `Instruction: ${instruction}`,
  ].join('\n');

  try {
    const res = await fetch(`http://${ipAddress}:${OPENCLAW_PORT}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: message }],
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      return { success: false, error: `Agent returned ${res.status}` };
    }

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: msg };
  }
}

// ============================================================
// Main Evaluation Loop
// ============================================================

const TRIGGER_EVALUATORS: Record<
  string,
  (config: Record<string, unknown>, lastTriggeredAt: Date | null) => Promise<boolean>
> = {
  CRON_SCHEDULE: evaluateCronTrigger,
  PRICE_THRESHOLD: evaluatePriceThreshold,
  POLYMARKET_ODDS: evaluatePolymarketOdds,
};

async function evaluateAllAlerts(): Promise<void> {
  try {
    // Fetch all enabled alert rules on active strategies with their deployment info
    const alertRules = await prisma.alertRule.findMany({
      where: {
        enabled: true,
        strategy: { status: 'ACTIVE' },
      },
      include: {
        strategy: {
          include: {
            deployment: {
              select: {
                id: true,
                status: true,
                ipAddress: true,
                accessToken: true,
              },
            },
          },
        },
      },
    });

    if (alertRules.length === 0) return;

    // Group by trigger type for efficient batch processing
    for (const rule of alertRules) {
      const deployment = rule.strategy.deployment;

      // Skip if deployment isn't ready or missing connection info
      if (deployment.status !== 'READY' || !deployment.ipAddress || !deployment.accessToken) {
        continue;
      }

      const evaluator = TRIGGER_EVALUATORS[rule.triggerType];
      if (!evaluator) continue;

      try {
        const shouldFire = await evaluator(
          rule.triggerConfig as Record<string, unknown>,
          rule.lastTriggeredAt
        );

        if (!shouldFire) continue;

        // Fire the alert — send instruction to agent
        console.log(
          `[alert-engine] Firing alert ${rule.id} (${rule.triggerType}) for strategy ${rule.strategyId}`
        );

        const result = await sendInstructionToAgent(
          deployment.ipAddress,
          deployment.accessToken,
          rule.instruction,
          {
            strategyType: rule.strategy.strategyType,
            riskProfile: rule.strategy.riskProfile,
            thesisText: rule.strategy.thesisText,
          }
        );

        // Mark as triggered regardless of success (to enforce cooldown)
        await markAlertTriggered(rule.id);

        if (!result.success) {
          console.warn(`[alert-engine] Alert ${rule.id} delivery failed: ${result.error}`);
        }
      } catch (err) {
        console.error(`[alert-engine] Error evaluating rule ${rule.id}:`, err);
      }
    }
  } catch (err) {
    console.error('[alert-engine] Evaluation cycle failed:', err);
  }
}

// ============================================================
// Lifecycle
// ============================================================

let evaluationTimer: ReturnType<typeof setInterval> | null = null;
const EVAL_INTERVAL_MS = 30_000; // 30 seconds

export function startAlertEvaluator(): void {
  if (evaluationTimer) return;
  console.log('[alert-engine] Starting alert evaluator (30s interval)');

  // Run first evaluation after a short delay to let the server fully start
  setTimeout(() => {
    evaluateAllAlerts().catch((err) =>
      console.error('[alert-engine] Initial evaluation failed:', err)
    );
  }, 5_000);

  evaluationTimer = setInterval(() => {
    evaluateAllAlerts().catch((err) =>
      console.error('[alert-engine] Evaluation cycle error:', err)
    );
  }, EVAL_INTERVAL_MS);
}

export function stopAlertEvaluator(): void {
  if (evaluationTimer) {
    clearInterval(evaluationTimer);
    evaluationTimer = null;
    console.log('[alert-engine] Alert evaluator stopped');
  }
}
