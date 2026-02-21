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
    if (rule.ruleType === 'STOP_LOSS' || rule.ruleType === 'TRAILING_STOP') {
      return currentPrice <= rule.triggerPrice;
    }
    if (rule.ruleType === 'TAKE_PROFIT') return currentPrice >= rule.triggerPrice;
    return false;
  }

  async executeRule(rule: RuleLike): Promise<{ txHash?: string; orderId?: string }> {
    const action = JSON.parse(rule.action) as {
      type: 'SELL_ALL' | 'SELL_PARTIAL';
      amount?: number;
    };

    try {
      // Check if market is closed before attempting execution
      const position = await this.positionMonitor.getPosition(rule.marketId, rule.tokenId);
      if (position) {
        // Check if market is redeemable (resolved)
        if (position.redeemable) {
          const errorMessage = `Market is resolved and redeemable - cannot execute trades for tokenId ${rule.tokenId}`;
          await this.ruleManager.markRuleFailed(rule.id, errorMessage);
          throw new Error(errorMessage);
        }

        // Check if market end date has passed
        if (position.endDate) {
          const endDate = new Date(position.endDate);
          const now = new Date();
          if (endDate < now) {
            const errorMessage = `Market has ended (${endDate.toISOString()}) - cannot execute trades for tokenId ${rule.tokenId}`;
            await this.ruleManager.markRuleFailed(rule.id, errorMessage);
            throw new Error(errorMessage);
          }
        }
      }

      let amount: number;

      // Determine the amount to sell
      if (action.type === 'SELL_PARTIAL' && action.amount) {
        amount = action.amount;
      } else {
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
          // Mark rule as failed - no shares to sell
          const errorMessage = `Cannot execute SELL_ALL: No shares found for tokenId ${rule.tokenId}. The position may have already been sold or the market is closed.`;
          await this.ruleManager.markRuleFailed(rule.id, errorMessage);
          throw new Error(errorMessage);
        }

        // Additional check: if holding has redeemable flag set, market is closed
        if (holding.redeemable) {
          const errorMessage = `Market is resolved - cannot sell shares for tokenId ${rule.tokenId}`;
          await this.ruleManager.markRuleFailed(rule.id, errorMessage);
          throw new Error(errorMessage);
        }

        amount = holding.shares;
      }

      const result = await this.executeBetWithRetry(rule, amount);

      const didMark = await this.ruleManager.markRuleTriggered(
        rule.id,
        result.txHash ?? result.orderId
      );
      if (didMark) await this.eventLogger.logEvent(rule.id, 'ACTION_EXECUTED', { result });
      return result;
    } catch (error) {
      // Extract the actual error message from Vincent API response
      const errorMessage = this.extractErrorMessage(error);

      // Check if this is a permanent failure that should mark the rule as FAILED
      const isPermanentFailure = this.isPermanentFailure(errorMessage, error);

      if (isPermanentFailure) {
        await this.ruleManager.markRuleFailed(rule.id, errorMessage);
      }

      await this.eventLogger.logEvent(rule.id, 'ACTION_FAILED', {
        message: errorMessage,
        isPermanent: isPermanentFailure,
      });
      throw error;
    }
  }

  private extractErrorMessage(error: any): string {
    // Try to extract the actual error message from Vincent API response
    // Format: error.response.data.error.message
    if (error?.response?.data?.error?.message) {
      return error.response.data.error.message;
    }

    // Fallback to axios error message
    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }

  private async executeBetWithRetry(
    rule: RuleLike,
    amount: number
  ): Promise<{ txHash?: string; orderId?: string }> {
    console.log('[RuleExecutor] Executing market order:', {
      ruleId: rule.id,
      ruleType: rule.ruleType,
      amount,
    });

    await this.eventLogger.logEvent(rule.id, 'ACTION_ATTEMPT', {
      type: 'market_order',
    });

    const result = await this.vincentClient.placeBet({
      tokenId: rule.tokenId,
      side: 'SELL',
      amount,
    });

    console.log('[RuleExecutor] Market order succeeded:', result);
    return result;
  }

  private isPermanentFailure(message: string, error: any): boolean {
    const permanentErrors = [
      'insufficient funds',
      'invalid token',
      'invalid price',
      'market closed',
      'market resolved',
      'market appears to be closed',
      'no orderbook data',
      'no match',
      'no liquidity',
      'position not found',
      'cannot execute',
    ];

    const lowerMessage = message.toLowerCase();

    if (permanentErrors.some((err) => lowerMessage.includes(err.toLowerCase()))) {
      return true;
    }

    if (error?.response?.status) {
      const status = error.response.status;
      if ([400, 403, 404].includes(status)) {
        return true;
      }
      if (
        status === 500 &&
        (lowerMessage.includes('orderbook') || lowerMessage.includes('no match'))
      ) {
        return true;
      }
    }

    return false;
  }
}
