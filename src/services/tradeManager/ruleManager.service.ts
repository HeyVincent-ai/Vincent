import { z } from 'zod';
import prisma from '../../db/client.js';
import { AppError } from '../../api/middleware/errorHandler.js';
import * as eventLogger from './eventLogger.service.js';

// Fetch market slug from Gamma API using condition ID
async function fetchMarketSlug(conditionId: string): Promise<string | null> {
  try {
    const response = await fetch(
      `https://gamma-api.polymarket.com/markets?condition_ids=${conditionId}&limit=1`
    );
    if (!response.ok) return null;
    const markets = await response.json();
    if (!Array.isArray(markets) || markets.length === 0) return null;
    return markets[0].slug || null;
  } catch {
    return null;
  }
}

const actionSchema = z.union([
  z.object({ type: z.literal('SELL_ALL') }),
  z.object({ type: z.literal('SELL_PARTIAL'), amount: z.number().positive() }),
]);

export const createRuleSchema = z
  .object({
    ruleType: z.enum(['STOP_LOSS', 'TAKE_PROFIT', 'TRAILING_STOP']),
    marketId: z.string().min(1),
    tokenId: z.string().min(1),
    side: z.enum(['BUY', 'SELL']).default('BUY'),
    triggerPrice: z.number().gt(0).lt(1),
    trailingPercent: z.number().gt(0).lt(100).optional(),
    action: actionSchema,
  })
  .superRefine((data, ctx) => {
    if (data.ruleType === 'TRAILING_STOP' && data.trailingPercent === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['trailingPercent'],
        message: 'trailingPercent is required for TRAILING_STOP rules',
      });
    }
    if (data.ruleType !== 'TRAILING_STOP' && data.trailingPercent !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['trailingPercent'],
        message: 'trailingPercent is only supported for TRAILING_STOP rules',
      });
    }
  });

export const updateRuleSchema = z.object({ triggerPrice: z.number().gt(0).lt(1) });

export async function createRule(secretId: string, input: z.infer<typeof createRuleSchema>) {
  const payload = createRuleSchema.parse(input);
  const marketSlug = await fetchMarketSlug(payload.marketId);

  const rule = await prisma.tradeRule.create({
    data: {
      secretId,
      ruleType: payload.ruleType,
      marketId: payload.marketId,
      marketSlug,
      tokenId: payload.tokenId,
      side: payload.side,
      triggerPrice: payload.triggerPrice,
      trailingPercent: payload.trailingPercent,
      action: JSON.stringify(payload.action),
    },
  });

  await eventLogger.logEvent(rule.id, 'RULE_CREATED', { payload });
  return rule;
}

/**
 * Get rules. When secretId is provided, returns rules for that secret only.
 * When omitted (used by the worker), returns rules across all secrets.
 */
export async function getRules(secretId?: string, status?: string) {
  return prisma.tradeRule.findMany({
    where: {
      ...(secretId ? { secretId } : undefined),
      ...(status ? { status: status as any } : undefined),
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getRule(secretId: string, id: string) {
  const rule = await prisma.tradeRule.findUnique({ where: { id } });
  if (!rule || rule.secretId !== secretId) {
    throw new AppError('NOT_FOUND', 'Rule not found', 404);
  }
  return rule;
}

export async function updateRule(
  secretId: string,
  id: string,
  data: z.infer<typeof updateRuleSchema>
) {
  updateRuleSchema.parse(data);
  const existing = await getRule(secretId, id);
  if (existing.status !== 'ACTIVE') {
    throw new AppError('BAD_REQUEST', 'Only active rules can be updated', 400);
  }
  return prisma.tradeRule.update({
    where: { id },
    data: { triggerPrice: data.triggerPrice },
  });
}

export async function cancelRule(secretId: string, id: string) {
  const existing = await getRule(secretId, id);
  if (existing.status !== 'ACTIVE' && existing.status !== 'FAILED') {
    throw new AppError('BAD_REQUEST', 'Only active or failed rules can be canceled', 400);
  }
  const rule = await prisma.tradeRule.update({
    where: { id },
    data: { status: 'CANCELED' },
  });
  await eventLogger.logEvent(id, 'RULE_CANCELED', {});
  return rule;
}

/** Idempotent trigger — used by the worker (no secretId check) */
export async function markRuleTriggered(id: string, txHash?: string): Promise<boolean> {
  const result = await prisma.tradeRule.updateMany({
    where: { id, status: 'ACTIVE' },
    data: { status: 'TRIGGERED', triggeredAt: new Date(), triggerTxHash: txHash },
  });
  return result.count === 1;
}

export async function markRuleFailed(id: string, errorMessage: string): Promise<boolean> {
  const result = await prisma.tradeRule.updateMany({
    where: { id, status: 'ACTIVE' },
    data: { status: 'FAILED', errorMessage, triggeredAt: new Date() },
  });
  await eventLogger.logEvent(id, 'RULE_FAILED', { errorMessage });
  return result.count === 1;
}

export async function updateTrailingTrigger(
  id: string,
  triggerPrice: number,
  context?: { currentPrice: number; trailingPercent: number }
): Promise<boolean> {
  const result = await prisma.tradeRule.updateMany({
    where: {
      id,
      status: 'ACTIVE',
      ruleType: 'TRAILING_STOP',
      triggerPrice: { lt: triggerPrice },
    },
    data: { triggerPrice },
  });

  if (result.count === 1) {
    await eventLogger.logEvent(id, 'RULE_TRAILING_UPDATED', {
      triggerPrice,
      ...(context ?? {}),
    });
    return true;
  }
  return false;
}
