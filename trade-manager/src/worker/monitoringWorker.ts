import { EventLoggerService } from '../services/eventLogger.service.js';
import { PositionMonitorService } from '../services/positionMonitor.service.js';
import { RuleExecutorService } from '../services/ruleExecutor.service.js';
import { RuleManagerService } from '../services/ruleManager.service.js';
import { VincentClientService } from '../services/vincentClient.service.js';
import {
  PolymarketWebSocketService,
  PriceUpdate,
} from '../services/polymarketWebSocket.service.js';
import { logger } from '../utils/logger.js';

export interface WorkerStatus {
  running: boolean;
  activeRulesCount: number;
  lastSyncTime?: string;
  consecutiveFailures: number;
  circuitBreakerUntil?: string;
  webSocketConnected: boolean;
  webSocketSubscriptions: number;
}

export class MonitoringWorker {
  private timer?: NodeJS.Timeout;
  private readonly executingRuleIds = new Set<string>();
  private readonly status: WorkerStatus = {
    running: false,
    activeRulesCount: 0,
    consecutiveFailures: 0,
    webSocketConnected: false,
    webSocketSubscriptions: 0,
  };
  private readonly priceCache = new Map<string, number>();

  constructor(
    private readonly intervalSeconds: number,
    private readonly circuitBreakerThreshold: number,
    private readonly circuitBreakerCooldownSeconds: number,
    private readonly positionMonitor: PositionMonitorService,
    private readonly ruleManager: RuleManagerService,
    private readonly ruleExecutor: RuleExecutorService,
    private readonly eventLogger: EventLoggerService,
    private readonly webSocketService?: PolymarketWebSocketService
  ) {
    // Set up WebSocket event handlers if enabled
    if (this.webSocketService) {
      this.setupWebSocketHandlers();
    }
  }

  getStatus(): WorkerStatus {
    return { ...this.status };
  }

  startWorker(): void {
    if (this.timer) return;
    this.status.running = true;

    // Start WebSocket connection if enabled
    if (this.webSocketService) {
      logger.info('[MonitoringWorker] Starting WebSocket connection');
      this.webSocketService.connect();
    }

    // Start polling timer (serves as fallback and periodic sync)
    this.timer = setInterval(() => void this.tick(), this.intervalSeconds * 1000);
    void this.tick();
  }

  stopWorker(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.status.running = false;

    // Disconnect WebSocket if enabled
    if (this.webSocketService) {
      logger.info('[MonitoringWorker] Stopping WebSocket connection');
      this.webSocketService.disconnect();
    }
  }

  private async tick(): Promise<void> {
    if (this.status.circuitBreakerUntil && new Date(this.status.circuitBreakerUntil) > new Date()) {
      return;
    }

    try {
      const activeRules = await this.ruleManager.getRules('ACTIVE');
      this.status.activeRulesCount = activeRules.length;

      // Sync WebSocket subscriptions with active rules
      if (this.webSocketService) {
        await this.syncWebSocketSubscriptions(activeRules);
      }

      // Update positions from Vincent API
      await this.positionMonitor.updatePositions();

      // Evaluate all rules with current prices
      // Use cached prices from WebSocket if available, otherwise fetch via HTTP
      for (const rule of activeRules) {
        try {
          let currentPrice = this.priceCache.get(rule.tokenId);

          // Fallback to HTTP if no WebSocket price available
          if (currentPrice === undefined) {
            currentPrice = await this.positionMonitor.getCurrentPrice(rule.marketId, rule.tokenId);
            this.priceCache.set(rule.tokenId, currentPrice);
          }

          await this.maybeAdjustTrailingTrigger(rule, currentPrice);

          const shouldTrigger = this.ruleExecutor.evaluateRule(rule, currentPrice);
          await this.eventLogger.logEvent(rule.id, 'RULE_EVALUATED', {
            currentPrice,
            triggerPrice: rule.triggerPrice,
            shouldTrigger,
          });
          if (shouldTrigger) {
            await this.trigger(rule);
          }
        } catch (error) {
          // Log the error for this specific rule, but continue processing other rules
          logger.error(
            {
              ruleId: rule.id,
              ruleType: rule.ruleType,
              error: error instanceof Error ? error.message : String(error),
            },
            'Failed to evaluate or execute rule'
          );
          // Don't throw - continue with other rules
        }
      }
      this.status.lastSyncTime = new Date().toISOString();
      this.status.consecutiveFailures = 0;
      this.status.circuitBreakerUntil = undefined;
    } catch (error) {
      this.status.consecutiveFailures += 1;
      logger.error({ err: error }, 'Worker tick failed');
      if (this.status.consecutiveFailures >= this.circuitBreakerThreshold) {
        this.status.circuitBreakerUntil = new Date(
          Date.now() + this.circuitBreakerCooldownSeconds * 1000
        ).toISOString();
      }
    }
  }

  private async trigger(rule: {
    id: string;
    marketId: string;
    tokenId: string;
    action: string;
    ruleType: string;
    triggerPrice: number;
  }): Promise<void> {
    if (this.executingRuleIds.has(rule.id)) {
      logger.warn(
        { ruleId: rule.id },
        '[MonitoringWorker] Skipping duplicate trigger while executing'
      );
      return;
    }

    this.executingRuleIds.add(rule.id);
    try {
      const result = await this.ruleExecutor.executeRule(rule);
      await this.eventLogger.logEvent(rule.id, 'RULE_TRIGGERED', { result });
    } finally {
      this.executingRuleIds.delete(rule.id);
    }
  }

  private setupWebSocketHandlers(): void {
    if (!this.webSocketService) return;

    this.webSocketService.on('connected', () => {
      this.status.webSocketConnected = true;
      logger.info('[MonitoringWorker] WebSocket connected');
    });

    this.webSocketService.on('disconnected', () => {
      this.status.webSocketConnected = false;
      logger.warn('[MonitoringWorker] WebSocket disconnected');
    });

    this.webSocketService.on('price', (update: PriceUpdate) => {
      // Update price cache
      this.priceCache.set(update.tokenId, update.price);
      logger.debug(update, '[MonitoringWorker] Price update received');

      // Evaluate rules for this token immediately
      void this.evaluateRulesForToken(update.tokenId, update.price);
    });

    this.webSocketService.on('error', (error: Error) => {
      logger.error({ error: error.message }, '[MonitoringWorker] WebSocket error');
    });
  }

  private async evaluateRulesForToken(tokenId: string, price: number): Promise<void> {
    try {
      const activeRules = await this.ruleManager.getRules('ACTIVE');
      const matchingRules = activeRules.filter((rule) => rule.tokenId === tokenId);

      for (const rule of matchingRules) {
        await this.maybeAdjustTrailingTrigger(rule, price);

        const shouldTrigger = this.ruleExecutor.evaluateRule(rule, price);
        await this.eventLogger.logEvent(rule.id, 'RULE_EVALUATED', {
          currentPrice: price,
          triggerPrice: rule.triggerPrice,
          shouldTrigger,
          source: 'websocket',
        });

        if (shouldTrigger) {
          logger.info(
            {
              ruleId: rule.id,
              tokenId,
              price,
            },
            '[MonitoringWorker] Rule triggered by WebSocket price update'
          );
          await this.trigger(rule);
        }
      }
    } catch (error) {
      logger.error(
        {
          tokenId,
          error,
        },
        '[MonitoringWorker] Failed to evaluate rules for token'
      );
    }
  }

  private async syncWebSocketSubscriptions(activeRules: Array<{ tokenId: string }>): Promise<void> {
    if (!this.webSocketService) return;

    // Get unique token IDs from active rules
    const requiredTokenIds = new Set(activeRules.map((rule) => rule.tokenId));
    const currentTokenIds = new Set(this.webSocketService.getSubscribedTokens());

    // Find tokens to subscribe and unsubscribe
    const toSubscribe = [...requiredTokenIds].filter((id) => !currentTokenIds.has(id));
    const toUnsubscribe = [...currentTokenIds].filter((id) => !requiredTokenIds.has(id));

    if (toSubscribe.length > 0) {
      logger.info(
        {
          count: toSubscribe.length,
          tokens: toSubscribe,
        },
        '[MonitoringWorker] Subscribing to new tokens'
      );
      this.webSocketService.subscribeToTokens(toSubscribe);
    }

    if (toUnsubscribe.length > 0) {
      logger.info(
        {
          count: toUnsubscribe.length,
          tokens: toUnsubscribe,
        },
        '[MonitoringWorker] Unsubscribing from tokens'
      );
      this.webSocketService.unsubscribeFromTokens(toUnsubscribe);
    }

    this.status.webSocketSubscriptions = requiredTokenIds.size;
  }

  private async maybeAdjustTrailingTrigger(
    rule: {
      id: string;
      ruleType: string;
      triggerPrice: number;
      trailingPercent?: number;
    },
    currentPrice: number
  ): Promise<void> {
    if (rule.ruleType !== 'TRAILING_STOP') return;
    if (typeof rule.trailingPercent !== 'number' || rule.trailingPercent <= 0) return;

    const nextTrigger =
      Math.round(Math.min(0.99, currentPrice * (1 - rule.trailingPercent / 100)) * 10000) / 10000;
    if (nextTrigger <= rule.triggerPrice) return;

    const previousTriggerPrice = rule.triggerPrice;
    const updated = await this.ruleManager.updateTrailingTrigger(rule.id, nextTrigger, {
      currentPrice,
      trailingPercent: rule.trailingPercent,
    });

    if (updated) {
      rule.triggerPrice = nextTrigger;
      logger.info(
        {
          ruleId: rule.id,
          oldTriggerPrice: previousTriggerPrice,
          newTriggerPrice: nextTrigger,
          currentPrice,
          trailingPercent: rule.trailingPercent,
        },
        '[MonitoringWorker] Trailing stop trigger updated'
      );
    }
  }
}

export const createWorkerDependencies = (
  vincentClient: VincentClientService,
  intervalSeconds: number,
  circuitBreakerThreshold: number,
  circuitBreakerCooldownSeconds: number,
  webSocketConfig?: {
    enabled: boolean;
    url: string;
    reconnectInitialDelay: number;
    reconnectMaxDelay: number;
  }
): MonitoringWorker => {
  const eventLogger = new EventLoggerService();
  const ruleManager = new RuleManagerService(eventLogger);
  const positionMonitor = new PositionMonitorService(vincentClient);
  const ruleExecutor = new RuleExecutorService(
    vincentClient,
    ruleManager,
    eventLogger,
    positionMonitor
  );

  // Create WebSocket service if enabled
  const webSocketService = webSocketConfig?.enabled
    ? new PolymarketWebSocketService({
        url: webSocketConfig.url,
        reconnectInitialDelay: webSocketConfig.reconnectInitialDelay,
        reconnectMaxDelay: webSocketConfig.reconnectMaxDelay,
      })
    : undefined;

  return new MonitoringWorker(
    intervalSeconds,
    circuitBreakerThreshold,
    circuitBreakerCooldownSeconds,
    positionMonitor,
    ruleManager,
    ruleExecutor,
    eventLogger,
    webSocketService
  );
};
