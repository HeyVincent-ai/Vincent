import { EventLoggerService } from '../services/eventLogger.service.js';
import { PositionMonitorService } from '../services/positionMonitor.service.js';
import { RuleExecutorService } from '../services/ruleExecutor.service.js';
import { RuleManagerService } from '../services/ruleManager.service.js';
import { VincentClientService } from '../services/vincentClient.service.js';
import { logger } from '../utils/logger.js';

export interface WorkerStatus {
  running: boolean;
  activeRulesCount: number;
  lastSyncTime?: string;
  consecutiveFailures: number;
  circuitBreakerUntil?: string;
}

export class MonitoringWorker {
  private timer?: NodeJS.Timeout;
  private readonly status: WorkerStatus = {
    running: false,
    activeRulesCount: 0,
    consecutiveFailures: 0,
  };

  constructor(
    private readonly intervalSeconds: number,
    private readonly circuitBreakerThreshold: number,
    private readonly circuitBreakerCooldownSeconds: number,
    private readonly positionMonitor: PositionMonitorService,
    private readonly ruleManager: RuleManagerService,
    private readonly ruleExecutor: RuleExecutorService,
    private readonly eventLogger: EventLoggerService
  ) {}

  getStatus(): WorkerStatus {
    return { ...this.status };
  }

  startWorker(): void {
    if (this.timer) return;
    this.status.running = true;
    this.timer = setInterval(() => void this.tick(), this.intervalSeconds * 1000);
    void this.tick();
  }

  stopWorker(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.status.running = false;
  }

  private async tick(): Promise<void> {
    if (this.status.circuitBreakerUntil && new Date(this.status.circuitBreakerUntil) > new Date()) {
      return;
    }

    try {
      const activeRules = await this.ruleManager.getRules('ACTIVE');
      this.status.activeRulesCount = activeRules.length;

      await this.positionMonitor.updatePositions();

      const priceCache = new Map<string, number>();
      for (const rule of activeRules) {
        const key = `${rule.marketId}:${rule.tokenId}`;
        if (!priceCache.has(key)) {
          priceCache.set(
            key,
            await this.positionMonitor.getCurrentPrice(rule.marketId, rule.tokenId)
          );
        }
        const currentPrice = priceCache.get(key) as number;
        const shouldTrigger = this.ruleExecutor.evaluateRule(rule, currentPrice);
        await this.eventLogger.logEvent(rule.id, 'RULE_EVALUATED', { currentPrice, shouldTrigger });
        if (shouldTrigger) {
          await this.trigger(rule);
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
    const result = await this.ruleExecutor.executeRule(rule);
    await this.eventLogger.logEvent(rule.id, 'RULE_TRIGGERED', { result });
  }
}

export const createWorkerDependencies = (
  vincentClient: VincentClientService,
  intervalSeconds: number,
  circuitBreakerThreshold: number,
  circuitBreakerCooldownSeconds: number
): MonitoringWorker => {
  const eventLogger = new EventLoggerService();
  const ruleManager = new RuleManagerService(eventLogger);
  const positionMonitor = new PositionMonitorService(vincentClient);
  const ruleExecutor = new RuleExecutorService(vincentClient, ruleManager, eventLogger);

  return new MonitoringWorker(
    intervalSeconds,
    circuitBreakerThreshold,
    circuitBreakerCooldownSeconds,
    positionMonitor,
    ruleManager,
    ruleExecutor,
    eventLogger
  );
};
