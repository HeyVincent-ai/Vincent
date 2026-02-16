import { EventLoggerService } from './eventLogger.service.js';
import { RuleManagerService } from './ruleManager.service.js';
import { VincentClientService } from './vincentClient.service.js';

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
    private readonly eventLogger: EventLoggerService
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
    const betPayload = {
      marketId: rule.marketId,
      tokenId: rule.tokenId,
      side: 'SELL',
      orderType: 'MARKET',
      quantity: action.type === 'SELL_PARTIAL' ? action.amount : 'ALL',
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
