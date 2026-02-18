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
          const errorMessage = `Cannot execute SELL_ALL: No shares found for tokenId ${rule.tokenId}. The position may have already been sold.`;
          await this.ruleManager.markRuleFailed(rule.id, errorMessage);
          throw new Error(errorMessage);
        }

        amount = holding.shares;
      }

      // Execute the bet with smart retry logic
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
    // Get current market price to use for limit order
    const currentPrice = await this.positionMonitor.getCurrentPrice(rule.marketId, rule.tokenId);

    // If we can't get a current price, try market order only (no limit price)
    if (currentPrice === 0) {
      console.log('[RuleExecutor] No current price available, using market order only');
      await this.eventLogger.logEvent(rule.id, 'ACTION_EXECUTED', {
        attempt: 1,
        type: 'market_order',
        reason: 'no_price_data',
      });

      const result = await this.vincentClient.placeBet({
        tokenId: rule.tokenId,
        side: 'SELL',
        amount,
        // No price = market order
      });

      console.log('[RuleExecutor] Market order succeeded:', result);
      return result;
    }

    // Calculate limit price based on rule type
    // For STOP_LOSS: use current price with -2% slippage to ensure execution
    // For TAKE_PROFIT: use current price with -1% slippage
    const slippage = rule.ruleType === 'STOP_LOSS' ? 0.02 : 0.01;
    // Polymarket requires prices between 0.01 and 0.99
    const limitPrice = Math.max(0.01, Math.min(0.99, currentPrice * (1 - slippage)));

    console.log('[RuleExecutor] Executing bet with smart retry:', {
      ruleId: rule.id,
      ruleType: rule.ruleType,
      amount,
      currentPrice,
      limitPrice: limitPrice.toFixed(4),
    });

    // ATTEMPT 1: Try with limit order at calculated price
    try {
      await this.eventLogger.logEvent(rule.id, 'ACTION_EXECUTED', {
        attempt: 1,
        type: 'limit_order',
        price: limitPrice,
      });

      const result = await this.vincentClient.placeBet({
        tokenId: rule.tokenId,
        side: 'SELL',
        amount,
        price: limitPrice,
      });

      console.log('[RuleExecutor] Limit order succeeded:', result);
      return result;
    } catch (limitError: any) {
      const errorMessage = this.extractErrorMessage(limitError);
      console.log('[RuleExecutor] Limit order failed:', errorMessage);

      // Check if this is a "no match" error (no liquidity at this price)
      if (!this.isNoMatchError(errorMessage, limitError)) {
        // If it's not a "no match" error, check if it's permanent
        // If permanent, don't retry - rethrow immediately
        const isPermanent = this.isPermanentFailure(errorMessage, limitError);
        if (isPermanent) {
          console.log('[RuleExecutor] Permanent failure detected, not retrying');
          throw limitError;
        }

        // For non-permanent errors (like temporary 500s), also rethrow
        // We only retry for "no match" errors
        console.log('[RuleExecutor] Non-retriable error, not attempting market order');
        throw limitError;
      }

      // ATTEMPT 2: Retry with market order (no price limit)
      console.log('[RuleExecutor] Retrying with market order (no price limit)');
      await this.eventLogger.logEvent(rule.id, 'ACTION_EXECUTED', {
        attempt: 2,
        type: 'market_order',
        previousError: errorMessage,
      });

      try {
        const result = await this.vincentClient.placeBet({
          tokenId: rule.tokenId,
          side: 'SELL',
          amount,
          // No price = market order
        });

        console.log('[RuleExecutor] Market order succeeded:', result);
        return result;
      } catch (marketError: any) {
        const marketErrorMessage = this.extractErrorMessage(marketError);
        console.log('[RuleExecutor] Market order also failed:', marketErrorMessage);

        // Both attempts failed - throw the market order error
        throw marketError;
      }
    }
  }

  private isNoMatchError(message: string, _error: any): boolean {
    const lowerMessage = message.toLowerCase();
    return lowerMessage.includes('no match') || lowerMessage.includes('no liquidity');
  }

  private isPermanentFailure(message: string, error: any): boolean {
    // NOTE: "no match" is NOT considered permanent because we retry with market order
    const permanentErrors = [
      'insufficient funds', // Not enough balance
      'invalid token', // Invalid token ID
      'invalid price', // Price out of valid range
      'market closed', // Market is no longer active
      'market resolved', // Market has already resolved
      'position not found', // Position doesn't exist
    ];

    const lowerMessage = message.toLowerCase();

    // Check for specific permanent error messages
    if (permanentErrors.some((err) => lowerMessage.includes(err.toLowerCase()))) {
      return true;
    }

    // If we still get "no match" after market order retry, it's permanent
    if (lowerMessage.includes('no match') && lowerMessage.includes('market order')) {
      return true;
    }

    // Check HTTP status codes for permanent failures
    if (error?.response?.status) {
      const status = error.response.status;
      // 400 = Bad Request (invalid params)
      // 403 = Forbidden (not allowed)
      // 404 = Not Found (invalid market/token)
      if ([400, 403, 404].includes(status)) {
        return true;
      }
    }

    return false;
  }
}
