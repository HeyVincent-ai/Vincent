import { AppError } from '../../api/middleware/errorHandler.js';
import * as polymarketSkill from '../../skills/polymarketSkill.service.js';
import * as ruleManager from './ruleManager.service.js';
import * as eventLogger from './eventLogger.service.js';
import * as positionMonitor from './positionMonitor.service.js';
import type { RuleLike } from './types.js';

/** Pure evaluation — returns true if the rule should trigger at this price. */
export function evaluateRule(rule: RuleLike, currentPrice: number): boolean {
  if (rule.ruleType === 'STOP_LOSS' || rule.ruleType === 'TRAILING_STOP') {
    return currentPrice <= rule.triggerPrice;
  }
  if (rule.ruleType === 'TAKE_PROFIT') {
    return currentPrice >= rule.triggerPrice;
  }
  return false;
}

/** Execute a triggered rule — sells through polymarketSkill.placeBet() for policy enforcement. */
export async function executeRule(
  rule: RuleLike
): Promise<{ txHash?: string; orderId?: string; executed: boolean }> {
  let action: { type: 'SELL_ALL' | 'SELL_PARTIAL'; amount?: number };
  try {
    action = JSON.parse(rule.action) as typeof action;
  } catch {
    const errorMessage = `Invalid action JSON on rule ${rule.id}: ${rule.action}`;
    await ruleManager.markRuleFailed(rule.id, errorMessage);
    await eventLogger.logEvent(rule.id, 'ACTION_FAILED', {
      message: errorMessage,
      isPermanent: true,
    });
    throw new Error(errorMessage);
  }

  try {
    // Check if market is resolved before attempting execution
    const position = await positionMonitor.getPosition(rule.secretId, rule.marketId, rule.tokenId);
    if (position) {
      if (position.redeemable) {
        const errorMessage = `Market is resolved and redeemable - cannot execute trades for tokenId ${rule.tokenId}`;
        await ruleManager.markRuleFailed(rule.id, errorMessage);
        throw new Error(errorMessage);
      }
      if (position.endDate) {
        const endDate = new Date(position.endDate);
        if (endDate < new Date()) {
          const errorMessage = `Market has ended (${endDate.toISOString()}) - cannot execute trades for tokenId ${rule.tokenId}`;
          await ruleManager.markRuleFailed(rule.id, errorMessage);
          throw new Error(errorMessage);
        }
      }
    }

    let amount: number;

    if (action.type === 'SELL_PARTIAL' && action.amount) {
      amount = action.amount;
    } else {
      // SELL_ALL — fetch actual holdings
      const { holdings } = await polymarketSkill.getHoldings(rule.secretId);
      const holding = holdings.find((h) => h.tokenId === rule.tokenId);

      if (!holding || holding.shares <= 0) {
        const errorMessage = `Cannot execute SELL_ALL: No shares found for tokenId ${rule.tokenId}`;
        await ruleManager.markRuleFailed(rule.id, errorMessage);
        throw new Error(errorMessage);
      }
      if (holding.redeemable) {
        const errorMessage = `Market is resolved - cannot sell shares for tokenId ${rule.tokenId}`;
        await ruleManager.markRuleFailed(rule.id, errorMessage);
        throw new Error(errorMessage);
      }

      amount = holding.shares;
    }

    // Execute through polymarketSkill — this enforces policies + creates audit logs
    await eventLogger.logEvent(rule.id, 'ACTION_ATTEMPT', { type: 'market_order' });

    const result = await polymarketSkill.placeBet({
      secretId: rule.secretId,
      tokenId: rule.tokenId,
      side: 'SELL',
      amount,
    });

    if (result.status === 'denied') {
      const errorMessage = `Trade denied by policy: ${result.reason || 'unknown'}`;
      await ruleManager.markRuleFailed(rule.id, errorMessage);
      throw new Error(errorMessage);
    }

    if (result.status === 'pending_approval') {
      // Trade requires human approval — revert rule to ACTIVE so it can be
      // re-evaluated after approval is granted or denied.
      await ruleManager.revertToActive(rule.id);
      await eventLogger.logEvent(rule.id, 'ACTION_ATTEMPT', {
        status: 'pending_approval',
        message: 'Trade requires human approval; rule reverted to ACTIVE',
      });
      return { orderId: result.orderId, executed: false };
    }

    // Success — update the triggered rule with the order reference
    if (result.orderId) {
      await ruleManager.setTriggerTxHash(rule.id, result.orderId);
    }
    await eventLogger.logEvent(rule.id, 'ACTION_EXECUTED', { result });

    return { orderId: result.orderId, executed: true };
  } catch (error) {
    const errorMessage = extractErrorMessage(error);
    const isPermanent = isPermanentFailure(errorMessage, error);

    if (isPermanent) {
      await ruleManager.markRuleFailed(rule.id, errorMessage);
    }

    await eventLogger.logEvent(rule.id, 'ACTION_FAILED', {
      message: errorMessage,
      isPermanent,
    });
    throw error;
  }
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof AppError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

function isPermanentFailure(message: string, error: unknown): boolean {
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
    'denied by policy',
  ];

  const lowerMessage = message.toLowerCase();
  if (permanentErrors.some((err) => lowerMessage.includes(err))) return true;

  if (error instanceof AppError) {
    if ([400, 403, 404].includes(error.statusCode)) return true;
  }

  return false;
}
