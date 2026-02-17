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

      // For SELL_ALL, we need to get the user's position
      // Note: Vincent positions endpoint returns openOrders, not holdings
      // This is a limitation - we'll need to get holdings from a different source
      // For now, log detailed error and mark rule as failed
      const positions = await this.vincentClient.getPositions();
      console.log('[RuleExecutor] Positions from Vincent:', {
        count: positions.length,
        positions: positions.map((p: any) => ({
          tokenId: p.tokenId,
          marketId: p.marketId,
          quantity: p.quantity,
          side: p.side,
        })),
      });

      const position = positions.find(
        (p: any) => p.tokenId === rule.tokenId || p.token_id === rule.tokenId
      );

      if (!position) {
        // Mark rule as failed instead of crashing
        const prisma = await (await import('../db/client.js')).prisma;
        await prisma.tradeRule.update({
          where: { id: rule.id },
          data: {
            status: 'FAILED',
            errorMessage: `Cannot execute SELL_ALL: Position not found in openOrders. You may need to specify an exact amount or the position may have already been sold.`,
          },
        });
        throw new Error(
          `No position found for tokenId ${rule.tokenId}. The positions endpoint returns openOrders, not holdings. Consider creating the rule with SELL_PARTIAL and a specific amount, or check if the position still exists.`
        );
      }

      const betPayload = {
        tokenId: rule.tokenId,
        side: 'SELL' as const,
        amount: position.quantity ?? 0,
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
