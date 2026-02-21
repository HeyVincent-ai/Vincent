import { env } from '../../utils/env.js';
import { PolymarketWebSocketService } from './polymarketWebSocket.service.js';
import * as ruleManager from './ruleManager.service.js';
import * as ruleExecutor from './ruleExecutor.service.js';
import * as eventLogger from './eventLogger.service.js';
import * as positionMonitor from './positionMonitor.service.js';
import type { RuleLike, PriceUpdate, WorkerStatus } from './types.js';

const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_COOLDOWN_S = 60;

let timer: NodeJS.Timeout | undefined;
let webSocketService: PolymarketWebSocketService | undefined;

const executingRuleIds = new Set<string>();
const priceCache = new Map<string, number>();

const status: WorkerStatus = {
  running: false,
  activeRulesCount: 0,
  consecutiveFailures: 0,
  webSocketConnected: false,
  webSocketSubscriptions: 0,
};

export function getWorkerStatus(): WorkerStatus {
  return { ...status };
}

export function startTradeMonitoringWorker(): void {
  if (!env.TRADE_MANAGER_ENABLED) {
    console.log('[TradeManager] Disabled via TRADE_MANAGER_ENABLED=false');
    return;
  }

  if (timer) return;
  status.running = true;

  // Start WebSocket if enabled
  if (env.TRADE_MANAGER_WS_ENABLED) {
    webSocketService = new PolymarketWebSocketService();
    setupWebSocketHandlers(webSocketService);
    webSocketService.connect();
  }

  const intervalMs = env.TRADE_MANAGER_POLL_INTERVAL_S * 1000;
  timer = setInterval(() => void tick(), intervalMs);
  void tick();

  console.log(
    `[TradeManager] Worker started (poll=${env.TRADE_MANAGER_POLL_INTERVAL_S}s, ws=${env.TRADE_MANAGER_WS_ENABLED})`
  );
}

export function stopTradeMonitoringWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = undefined;
  }
  status.running = false;

  if (webSocketService) {
    webSocketService.disconnect();
    webSocketService = undefined;
  }
  console.log('[TradeManager] Worker stopped');
}

// ── Tick ────────────────────────────────────────────────────

async function tick(): Promise<void> {
  if (status.circuitBreakerUntil && new Date(status.circuitBreakerUntil) > new Date()) {
    return;
  }

  try {
    const activeRules = await ruleManager.getRules(undefined, 'ACTIVE');
    status.activeRulesCount = activeRules.length;

    // Sync WebSocket subscriptions
    if (webSocketService) {
      syncWebSocketSubscriptions(activeRules);
    }

    // Update positions for all distinct secrets with active rules
    await positionMonitor.updateAllPositions();

    // Evaluate each rule
    for (const rule of activeRules) {
      try {
        let currentPrice = priceCache.get(rule.tokenId);

        // Fallback to HTTP if no WebSocket price
        if (currentPrice === undefined) {
          currentPrice = await positionMonitor.getCurrentPrice(rule.tokenId);
          priceCache.set(rule.tokenId, currentPrice);
        }

        await maybeAdjustTrailingTrigger(rule, currentPrice);

        const shouldTrigger = ruleExecutor.evaluateRule(rule as RuleLike, currentPrice);

        // Only log evaluations that result in a trigger to avoid excessive DB writes
        if (shouldTrigger) {
          await eventLogger.logEvent(rule.id, 'RULE_EVALUATED', {
            currentPrice,
            triggerPrice: rule.triggerPrice,
            shouldTrigger,
          });
        }

        if (shouldTrigger) {
          await trigger(rule as RuleLike);
        }
      } catch (error) {
        console.error(
          `[TradeManager] Failed to evaluate rule ${rule.id}:`,
          error instanceof Error ? error.message : error
        );
      }
    }

    status.lastSyncTime = new Date().toISOString();
    status.consecutiveFailures = 0;
    status.circuitBreakerUntil = undefined;
  } catch (error) {
    status.consecutiveFailures += 1;
    console.error('[TradeManager] Tick failed:', error);
    if (status.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
      status.circuitBreakerUntil = new Date(
        Date.now() + CIRCUIT_BREAKER_COOLDOWN_S * 1000
      ).toISOString();
      console.warn(`[TradeManager] Circuit breaker open until ${status.circuitBreakerUntil}`);
    }
  }
}

// ── Trigger ─────────────────────────────────────────────────

async function trigger(rule: RuleLike): Promise<void> {
  // In-process guard prevents duplicate work within this instance
  if (executingRuleIds.has(rule.id)) return;

  // DB-level atomic claim: only proceeds if rule is still ACTIVE.
  // markRuleTriggered uses updateMany with status='ACTIVE' check,
  // so only one instance/process can claim it.
  const claimed = await ruleManager.markRuleTriggered(rule.id);
  if (!claimed) return; // another instance already claimed it

  executingRuleIds.add(rule.id);
  try {
    const result = await ruleExecutor.executeRule(rule);
    // Only log RULE_TRIGGERED if the trade was actually executed.
    // If executeRule handled pending_approval, it reverted the rule to ACTIVE.
    if (result.executed) {
      await eventLogger.logEvent(rule.id, 'RULE_TRIGGERED', { result });
    }
  } catch (error) {
    // Execution failed — revert to ACTIVE so it can be retried,
    // unless executeRule already marked it FAILED (permanent failure)
    await ruleManager.revertToActive(rule.id);
    throw error;
  } finally {
    executingRuleIds.delete(rule.id);
  }
}

// ── WebSocket ───────────────────────────────────────────────

function setupWebSocketHandlers(ws: PolymarketWebSocketService): void {
  ws.on('connected', () => {
    status.webSocketConnected = true;
    console.log('[TradeManager] WebSocket connected');
  });

  ws.on('disconnected', () => {
    status.webSocketConnected = false;
    console.warn('[TradeManager] WebSocket disconnected');
  });

  ws.on('price', (update: PriceUpdate) => {
    priceCache.set(update.tokenId, update.price);
    void evaluateRulesForToken(update.tokenId, update.price);
  });

  ws.on('error', (error: Error) => {
    console.error('[TradeManager] WebSocket error:', error.message);
  });
}

async function evaluateRulesForToken(tokenId: string, price: number): Promise<void> {
  try {
    const matchingRules = await ruleManager.getRules(undefined, 'ACTIVE', tokenId);

    for (const rule of matchingRules) {
      const prevTriggerPrice = rule.triggerPrice;
      await maybeAdjustTrailingTrigger(rule, price);
      const trailingAdjusted = rule.triggerPrice !== prevTriggerPrice;

      const shouldTrigger = ruleExecutor.evaluateRule(rule as RuleLike, price);

      if (shouldTrigger || trailingAdjusted) {
        await eventLogger.logEvent(rule.id, 'RULE_EVALUATED', {
          currentPrice: price,
          triggerPrice: rule.triggerPrice,
          shouldTrigger,
          source: 'websocket',
        });
      }

      if (shouldTrigger) {
        console.log(`[TradeManager] Rule ${rule.id} triggered by WS price ${price}`);
        await trigger(rule as RuleLike);
      }
    }
  } catch (error) {
    console.error(`[TradeManager] Failed to evaluate rules for token ${tokenId}:`, error);
  }
}

function syncWebSocketSubscriptions(activeRules: Array<{ tokenId: string }>): void {
  if (!webSocketService) return;

  const requiredTokenIds = new Set(activeRules.map((r) => r.tokenId));
  const currentTokenIds = new Set(webSocketService.getSubscribedTokens());

  const toSubscribe = [...requiredTokenIds].filter((id) => !currentTokenIds.has(id));
  const toUnsubscribe = [...currentTokenIds].filter((id) => !requiredTokenIds.has(id));

  if (toSubscribe.length > 0) webSocketService.subscribeToTokens(toSubscribe);
  if (toUnsubscribe.length > 0) {
    webSocketService.unsubscribeFromTokens(toUnsubscribe);
    // Evict stale cache entries for unsubscribed tokens
    for (const id of toUnsubscribe) {
      priceCache.delete(id);
    }
  }

  status.webSocketSubscriptions = requiredTokenIds.size;
}

// ── Trailing Stop ───────────────────────────────────────────

async function maybeAdjustTrailingTrigger(
  rule: { id: string; ruleType: string; triggerPrice: number; trailingPercent?: number | null },
  currentPrice: number
): Promise<void> {
  if (rule.ruleType !== 'TRAILING_STOP') return;
  if (typeof rule.trailingPercent !== 'number' || rule.trailingPercent <= 0) return;

  const nextTrigger =
    Math.round(Math.min(0.99, currentPrice * (1 - rule.trailingPercent / 100)) * 10000) / 10000;
  if (nextTrigger <= rule.triggerPrice) return;

  const updated = await ruleManager.updateTrailingTrigger(rule.id, nextTrigger, {
    currentPrice,
    trailingPercent: rule.trailingPercent,
  });

  if (updated) {
    rule.triggerPrice = nextTrigger;
    console.log(
      `[TradeManager] Trailing stop ${rule.id} trigger updated to ${nextTrigger} (price=${currentPrice})`
    );
  }
}
