import {
  TradeIntentStatus,
  TradeSide,
  TradeOrderType,
  TradingVenue,
  Prisma,
} from '@prisma/client';
import { z } from 'zod';
import prisma from '../db/client.js';
import { AppError } from '../api/middleware/errorHandler.js';
import * as alpacaApi from './alpaca.service.js';
import * as alpacaConnections from './alpacaConnections.service.js';
import * as tradingPolicyService from './tradingPolicy.service.js';

const TIME_IN_FORCE_VALUES = ['day', 'gtc', 'opg', 'cls', 'ioc', 'fok'] as const;

export const tradeIntentSchema = z
  .object({
    connectionId: z.string().optional(),
    symbol: z.string().min(1),
    side: z.enum(['buy', 'sell']),
    qty: z.number().positive().optional(),
    notionalUsd: z.number().positive().optional(),
    orderType: z.enum(['market', 'limit']),
    limitPrice: z.number().positive().optional(),
    timeInForce: z.enum(TIME_IN_FORCE_VALUES).optional(),
    idempotencyKey: z.string().max(128).optional(),
  })
  .superRefine((data, ctx) => {
    const hasQty = typeof data.qty === 'number';
    const hasNotional = typeof data.notionalUsd === 'number';
    if (hasQty === hasNotional) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Exactly one of qty or notionalUsd is required.',
        path: ['qty'],
      });
    }
    if (data.orderType === 'limit' && !data.limitPrice) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'limitPrice is required for limit orders.',
        path: ['limitPrice'],
      });
    }
    if (data.orderType === 'market' && data.limitPrice) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'limitPrice is not allowed for market orders.',
        path: ['limitPrice'],
      });
    }
    if (hasNotional && data.orderType !== 'market') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'notionalUsd is only supported for market orders.',
        path: ['notionalUsd'],
      });
    }
    if (hasNotional && data.timeInForce && data.timeInForce !== 'day') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'notionalUsd orders must use timeInForce=day.',
        path: ['timeInForce'],
      });
    }
  });

export interface NormalizedTradeIntent {
  connectionId?: string;
  symbol: string;
  side: TradeSide;
  qty?: number;
  notionalUsd?: number;
  orderType: TradeOrderType;
  limitPrice?: number;
  timeInForce: string;
  idempotencyKey?: string;
}

interface PolicyDecision {
  allowed: boolean;
  reasons: string[];
  computed: {
    orderNotionalUsd?: number | null;
    positionNotionalUsd?: number | null;
    dailyNotionalUsd?: number | null;
    rth?: boolean;
  };
  normalized: NormalizedTradeIntent;
  policy?: tradingPolicyService.TradingPolicyPublic | null;
}

function normalizeIntent(input: z.infer<typeof tradeIntentSchema>): NormalizedTradeIntent {
  return {
    connectionId: input.connectionId,
    symbol: input.symbol.trim().toUpperCase(),
    side: input.side === 'buy' ? TradeSide.BUY : TradeSide.SELL,
    qty: input.qty,
    notionalUsd: input.notionalUsd,
    orderType: input.orderType === 'market' ? TradeOrderType.MARKET : TradeOrderType.LIMIT,
    limitPrice: input.limitPrice,
    timeInForce: (input.timeInForce ?? 'day').toLowerCase(),
    idempotencyKey: input.idempotencyKey,
  };
}

function formatDateYmd(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function isWithinRth(date: Date, timeZone: string): boolean {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date);

  let weekday = '';
  let hour = 0;
  let minute = 0;

  for (const part of parts) {
    if (part.type === 'weekday') weekday = part.value;
    if (part.type === 'hour') hour = parseInt(part.value, 10);
    if (part.type === 'minute') minute = parseInt(part.value, 10);
  }

  if (['Sat', 'Sun'].includes(weekday)) return false;
  const minutes = hour * 60 + minute;
  return minutes >= 9 * 60 + 30 && minutes < 16 * 60;
}

async function getDailyNotionalUsed(
  userId: string,
  timeZone: string
): Promise<number> {
  const now = new Date();
  const dayKey = formatDateYmd(now, timeZone);
  const since = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  const intents = await prisma.tradeIntent.findMany({
    where: {
      userId,
      venue: TradingVenue.ALPACA,
      createdAt: { gte: since },
      status: { in: [TradeIntentStatus.SUBMITTED, TradeIntentStatus.FILLED, TradeIntentStatus.CANCELED] },
    },
    select: {
      createdAt: true,
      notionalUsd: true,
      qty: true,
      limitPrice: true,
      policyDecision: true,
    },
  });

  let total = 0;
  for (const intent of intents) {
    if (formatDateYmd(intent.createdAt, timeZone) !== dayKey) continue;
    let notional = intent.notionalUsd;
    if (notional == null && intent.qty != null && intent.limitPrice != null) {
      notional = intent.qty * intent.limitPrice;
    }
    if (notional == null) {
      const decision = intent.policyDecision as { computed?: { orderNotionalUsd?: number } } | null;
      notional = decision?.computed?.orderNotionalUsd ?? 0;
    }
    total += Math.abs(notional ?? 0);
  }

  return total;
}

export async function evaluatePolicy(
  userId: string,
  policy: tradingPolicyService.TradingPolicyPublic | null,
  intent: NormalizedTradeIntent,
  auth: alpacaApi.AlpacaAuth
): Promise<PolicyDecision> {
  const reasons: string[] = [];
  const computed: PolicyDecision['computed'] = {};

  if (!policy || !policy.enabled) {
    return {
      allowed: true,
      reasons: [],
      computed,
      normalized: intent,
      policy,
    };
  }

  if (policy.allowedSymbols.length > 0 && !policy.allowedSymbols.includes(intent.symbol)) {
    reasons.push(`Symbol ${intent.symbol} is not in the allowlist`);
  }

  const orderTypeLower = intent.orderType === TradeOrderType.MARKET ? 'market' : 'limit';
  if (policy.allowedOrderTypes.length > 0 && !policy.allowedOrderTypes.includes(orderTypeLower)) {
    reasons.push(`Order type ${orderTypeLower} is not allowed`);
  }

  if (policy.restrictToRth) {
    const rth = isWithinRth(new Date(), policy.timezone);
    computed.rth = rth;
    if (!rth) {
      reasons.push('Trading is restricted to regular market hours (9:30-16:00 ET, Mon-Fri)');
    }
  }

  let latestPrice: number | null = null;
  const needsLatestPrice =
    intent.orderType === TradeOrderType.MARKET &&
    (intent.qty != null || (policy.longOnly && intent.side === TradeSide.SELL && intent.notionalUsd != null));

  if (needsLatestPrice) {
    latestPrice = await alpacaApi.getLatestTradePrice(auth, intent.symbol);
    if (latestPrice == null) {
      reasons.push('Unable to fetch latest trade price for market order');
    }
  }

  const orderNotional =
    intent.notionalUsd ??
    (intent.qty != null && intent.limitPrice != null
      ? intent.qty * intent.limitPrice
      : intent.qty != null && latestPrice != null
        ? intent.qty * latestPrice
        : null);

  computed.orderNotionalUsd = orderNotional;

  if (policy.maxOrderNotionalUsd != null && orderNotional != null) {
    if (orderNotional > policy.maxOrderNotionalUsd) {
      reasons.push(`Order notional exceeds max order limit ($${policy.maxOrderNotionalUsd})`);
    }
  }

  if (policy.longOnly && intent.side === TradeSide.SELL) {
    const position = await alpacaApi.getPosition(auth, intent.symbol);
    const currentQty = position ? Number(position.qty) : 0;
    const impliedQty =
      intent.qty ??
      (orderNotional != null && latestPrice != null ? orderNotional / latestPrice : null);
    if (!impliedQty || impliedQty > currentQty) {
      reasons.push('Long-only policy: insufficient position to sell');
    }
  }

  if (policy.maxPositionNotionalUsdPerSymbol != null && orderNotional != null) {
    const position = await alpacaApi.getPosition(auth, intent.symbol);
    const currentMarketValue = position ? Math.abs(Number(position.market_value)) : 0;
    const nextMarketValue =
      intent.side === TradeSide.BUY
        ? currentMarketValue + orderNotional
        : Math.max(0, currentMarketValue - orderNotional);
    computed.positionNotionalUsd = nextMarketValue;

    if (nextMarketValue > policy.maxPositionNotionalUsdPerSymbol) {
      reasons.push(
        `Position notional exceeds max per-symbol limit ($${policy.maxPositionNotionalUsdPerSymbol})`
      );
    }
  }

  if (policy.maxDailyNotionalUsd != null && orderNotional != null) {
    const usedToday = await getDailyNotionalUsed(userId, policy.timezone);
    computed.dailyNotionalUsd = usedToday + orderNotional;
    if (usedToday + orderNotional > policy.maxDailyNotionalUsd) {
      reasons.push(`Daily notional exceeds max daily limit ($${policy.maxDailyNotionalUsd})`);
    }
  }

  return {
    allowed: reasons.length === 0,
    reasons,
    computed,
    normalized: intent,
    policy,
  };
}

function mapAlpacaStatus(status?: string | null): TradeIntentStatus {
  const normalized = (status ?? '').toLowerCase();
  if (normalized === 'filled') return TradeIntentStatus.FILLED;
  if (normalized === 'canceled' || normalized === 'cancelled') return TradeIntentStatus.CANCELED;
  if (normalized === 'rejected') return TradeIntentStatus.FAILED;
  return TradeIntentStatus.SUBMITTED;
}

export async function createTradeIntent(params: {
  userId: string;
  apiKeyId?: string;
  input: z.infer<typeof tradeIntentSchema>;
}) {
  const normalized = normalizeIntent(tradeIntentSchema.parse(params.input));

  if (normalized.idempotencyKey) {
    const existing = await prisma.tradeIntent.findFirst({
      where: {
        userId: params.userId,
        idempotencyKey: normalized.idempotencyKey,
      },
    });
    if (existing) {
      return { intent: existing, idempotent: true };
    }
  }

  const connection = await alpacaConnections.getConnection(params.userId, normalized.connectionId);
  if (!connection || !connection.isActive) {
    throw new AppError('ALPACA_NOT_CONNECTED', 'No active Alpaca connection found', 400);
  }

  const credentials = alpacaConnections.getDecryptedCredentials(connection);

  const policy = await tradingPolicyService.getPolicy(params.userId, TradingVenue.ALPACA);
  const decision = await evaluatePolicy(params.userId, policy, normalized, credentials);

  const intent = await prisma.tradeIntent.create({
    data: {
      userId: params.userId,
      apiKeyId: params.apiKeyId,
      venue: TradingVenue.ALPACA,
      connectionId: connection.id,
      symbol: normalized.symbol,
      side: normalized.side,
      qty: normalized.qty ?? null,
      notionalUsd: normalized.notionalUsd ?? null,
      orderType: normalized.orderType,
      limitPrice: normalized.limitPrice ?? null,
      timeInForce: normalized.timeInForce,
      status: decision.allowed ? TradeIntentStatus.PENDING_POLICY : TradeIntentStatus.REJECTED,
      policyDecision: decision as unknown as Prisma.InputJsonValue,
      idempotencyKey: normalized.idempotencyKey ?? null,
    },
  });

  await prisma.tradeIntentEvent.create({
    data: {
      tradeIntentId: intent.id,
      eventType: 'policy_checked',
      payload: decision as unknown as Prisma.InputJsonValue,
    },
  });

  if (!decision.allowed) {
    return { intent, policyDecision: decision };
  }

  const payload: Record<string, any> = {
    symbol: normalized.symbol,
    side: normalized.side === TradeSide.BUY ? 'buy' : 'sell',
    type: normalized.orderType === TradeOrderType.MARKET ? 'market' : 'limit',
    time_in_force: normalized.timeInForce,
  };
  if (normalized.idempotencyKey) {
    payload.client_order_id = normalized.idempotencyKey;
  }
  if (normalized.qty != null) payload.qty = normalized.qty.toString();
  if (normalized.notionalUsd != null) payload.notional = normalized.notionalUsd.toString();
  if (normalized.limitPrice != null) payload.limit_price = normalized.limitPrice.toString();

  try {
    const order = await alpacaApi.submitOrder(credentials, payload);
    const status = mapAlpacaStatus(order?.status);

    const updated = await prisma.tradeIntent.update({
      where: { id: intent.id },
      data: {
        status,
        alpacaOrderId: order?.id ?? null,
      },
    });

    await prisma.tradeIntentEvent.create({
      data: {
        tradeIntentId: intent.id,
        eventType: 'alpaca_submitted',
        payload: order as Prisma.InputJsonValue,
      },
    });

    return { intent: updated, order };
  } catch (error: any) {
    const updated = await prisma.tradeIntent.update({
      where: { id: intent.id },
      data: {
        status: TradeIntentStatus.FAILED,
        policyDecision: {
          ...(decision as object),
          error: error?.message ?? 'Alpaca order failed',
        } as Prisma.InputJsonValue,
      },
    });

    await prisma.tradeIntentEvent.create({
      data: {
        tradeIntentId: intent.id,
        eventType: 'alpaca_failed',
        payload: { message: error?.message ?? 'Alpaca order failed' },
      },
    });

    throw error;
  }
}
