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

    try {
      // For SELL_PARTIAL, we have a specific amount
      if (action.type === 'SELL_PARTIAL' && action.amount) {
        const betPayload = {
          tokenId: rule.tokenId,
          side: 'SELL' as const,
          amount: action.amount,
        };
        const result = await this.vincentClient.placeBet(betPayload);
        const didMark = await this.ruleManager.markRuleTriggered(
          rule.id,
          result.txHash ?? result.orderId
        );
        if (didMark) await this.eventLogger.logEvent(rule.id, 'ACTION_EXECUTED', { result });
        return result;
      }

      // For SELL_ALL, get the user's actual holdings
      const holdings = await this.vincentClient.getHoldings();
      console.log('[RuleExecutor] Holdings from Vincent:', {
        count: holdings.length,
        holdings: holdings.map((h: any) => ({
          tokenId: h.tokenId,
          shares: h.shares,
          outcome: h.outcome,
          marketTitle: h.marketTitle,
        })),
      });

      const holding = holdings.find((h: any) => h.tokenId === rule.tokenId);

      if (!holding || holding.shares <= 0) {
        // Mark rule as failed instead of crashing
        const prisma = await (await import('../db/client.js')).prisma;
        await prisma.tradeRule.update({
          where: { id: rule.id },
          data: {
            status: 'FAILED',
            errorMessage: `Cannot execute SELL_ALL: No shares found for tokenId ${rule.tokenId}. The position may have already been sold.`,
          },
        });
        throw new Error(
          `No holding found for tokenId ${rule.tokenId}. Available holdings: ${holdings.length}. The position may have already been sold.`
        );
      }

      const betPayload = {
        tokenId: rule.tokenId,
        side: 'SELL' as const,
        amount: holding.shares,
      };

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
