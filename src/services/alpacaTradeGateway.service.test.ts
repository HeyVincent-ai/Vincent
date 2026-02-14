import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/client', () => ({
  default: {
    tradeIntent: { findMany: vi.fn() },
  },
}));

vi.mock('./alpaca.service', () => ({
  getLatestTradePrice: vi.fn(),
  getPosition: vi.fn(),
}));

import prisma from '../db/client';
import * as alpacaApi from './alpaca.service';
import { TradeOrderType, TradeSide, TradingVenue } from '@prisma/client';
import { evaluatePolicy, tradeIntentSchema, type NormalizedTradeIntent } from './alpacaTradeGateway.service';

const mockedPrisma = vi.mocked(prisma);
const mockedAlpaca = vi.mocked(alpacaApi);

const basePolicy = {
  id: 'pol-1',
  venue: TradingVenue.ALPACA,
  enabled: true,
  allowedSymbols: ['AAPL'],
  allowedOrderTypes: ['market', 'limit'],
  longOnly: false,
  restrictToRth: false,
  timezone: 'America/New_York',
  maxOrderNotionalUsd: null,
  maxPositionNotionalUsdPerSymbol: null,
  maxDailyNotionalUsd: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const baseIntent: NormalizedTradeIntent = {
  symbol: 'AAPL',
  side: TradeSide.BUY,
  qty: 5,
  orderType: TradeOrderType.LIMIT,
  limitPrice: 100,
  timeInForce: 'day',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedPrisma.tradeIntent.findMany.mockResolvedValue([]);
  mockedAlpaca.getLatestTradePrice.mockResolvedValue(100);
  mockedAlpaca.getPosition.mockResolvedValue({ qty: '10', market_value: '1000' } as any);
});

describe('tradeIntentSchema', () => {
  it('rejects when both qty and notionalUsd are provided', () => {
    const parsed = tradeIntentSchema.safeParse({
      symbol: 'AAPL',
      side: 'buy',
      qty: 1,
      notionalUsd: 10,
      orderType: 'market',
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects notionalUsd for limit orders', () => {
    const parsed = tradeIntentSchema.safeParse({
      symbol: 'AAPL',
      side: 'buy',
      notionalUsd: 10,
      orderType: 'limit',
      limitPrice: 100,
    });
    expect(parsed.success).toBe(false);
  });
});

describe('evaluatePolicy', () => {
  it('allows when no policy is configured', async () => {
    const result = await evaluatePolicy('user-1', null, baseIntent, {
      baseUrl: 'https://paper-api.alpaca.markets',
      keyId: 'k',
      secretKey: 's',
    });
    expect(result.allowed).toBe(true);
    expect(result.reasons.length).toBe(0);
  });

  it('allows when policy is disabled', async () => {
    const policy = { ...basePolicy, enabled: false };
    const result = await evaluatePolicy('user-1', policy, baseIntent, {
      baseUrl: 'https://paper-api.alpaca.markets',
      keyId: 'k',
      secretKey: 's',
    });
    expect(result.allowed).toBe(true);
    expect(result.reasons.length).toBe(0);
  });

  it('rejects when symbol is not allowlisted', async () => {
    const policy = { ...basePolicy, allowedSymbols: ['MSFT'] };
    const result = await evaluatePolicy('user-1', policy, baseIntent, {
      baseUrl: 'https://paper-api.alpaca.markets',
      keyId: 'k',
      secretKey: 's',
    });
    expect(result.allowed).toBe(false);
    expect(result.reasons.join(' ')).toMatch(/not in the allowlist/);
  });

  it('enforces max order notional', async () => {
    const policy = { ...basePolicy, maxOrderNotionalUsd: 100 };
    const intent = { ...baseIntent, qty: 5, limitPrice: 50 };
    const result = await evaluatePolicy('user-1', policy, intent, {
      baseUrl: 'https://paper-api.alpaca.markets',
      keyId: 'k',
      secretKey: 's',
    });
    expect(result.allowed).toBe(false);
    expect(result.reasons.join(' ')).toMatch(/max order limit/);
  });

  it('blocks sells that exceed position when long-only', async () => {
    mockedAlpaca.getPosition.mockResolvedValue({ qty: '1', market_value: '100' } as any);
    const policy = { ...basePolicy, longOnly: true };
    const intent = { ...baseIntent, side: TradeSide.SELL, qty: 5 };
    const result = await evaluatePolicy('user-1', policy, intent, {
      baseUrl: 'https://paper-api.alpaca.markets',
      keyId: 'k',
      secretKey: 's',
    });
    expect(result.allowed).toBe(false);
    expect(result.reasons.join(' ')).toMatch(/Long-only/);
  });
});
