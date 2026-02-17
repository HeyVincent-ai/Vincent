import { EventLoggerService } from './eventLogger.service.js';
import { RuleManagerService } from './ruleManager.service.js';
import { VincentClientService } from './vincentClient.service.js';
import { PositionMonitorService } from './positionMonitor.service.js';

export interface RuleLike {
  id: string;
  ruleType: string;
  triggerPrice: number;
  action: string;
  marketId: string;
  tokenId: string;
}

export class RuleExecutorService {
  constructor(
    private readonly vincentClient: VincentClientService,
    private readonly ruleManager: RuleManagerService,
    private readonly eventLogger: EventLoggerService,
    private readonly positionMonitor: PositionMonitorService
  ) {}

  evaluateRule(rule: RuleLike, currentPrice: number): boolean {
    if (rule.ruleType === 'STOP_LOSS') return currentPrice <= rule.triggerPrice;
    if (rule.ruleType === 'TAKE_PROFIT') return currentPrice >= rule.triggerPrice;
    return false;
  }

  async executeRule(rule: RuleLike): Promise<{ txHash?: string; orderId?: string }> {
    const action = JSON.parse(rule.action) as {
      type: 'SELL_ALL' | 'SELL_PARTIAL';
      amount?: number;
    };

    // Get the user's current position to find out how many shares they hold
    const positions = await this.vincentClient.getPositions();
    const position = positions.find(
      (p) => p.tokenId === rule.tokenId && p.marketId === rule.marketId
    );

    if (!position || position.quantity <= 0) {
      throw new Error(`No position found for tokenId ${rule.tokenId}`);
    }

    // Vincent Polymarket API expects:
    // - side: "SELL"
    // - amount: number of shares to sell
    // - price: optional (omit for market order)
    const betPayload = {
      tokenId: rule.tokenId,
      side: 'SELL' as const,
      amount: action.type === 'SELL_PARTIAL' && action.amount ? action.amount : position.quantity,
    };

    try {
      const result = await this.vincentClient.placeBet(betPayload);
      const didMark = await this.ruleManager.markRuleTriggered(
        rule.id,
        result.txHash ?? result.orderId
      );
      if (didMark) await this.eventLogger.logEvent(rule.id, 'ACTION_EXECUTED', { result });
      return result;
    } catch (error) {
      await this.eventLogger.logEvent(rule.id, 'ACTION_FAILED', {
        message: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }
}
