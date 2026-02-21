import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────

vi.mock('../../db/client', () => ({ default: {} }));

vi.mock('../../skills/polymarketSkill.service.js', () => ({
  placeBet: vi.fn(),
  getHoldings: vi.fn(),
}));

vi.mock('./ruleManager.service.js', () => ({
  markRuleFailed: vi.fn(),
  markRulePendingApproval: vi.fn(),
  setTriggerTxHash: vi.fn(),
  revertToActive: vi.fn(),
}));

vi.mock('./eventLogger.service.js', () => ({
  logEvent: vi.fn(),
}));

vi.mock('./positionMonitor.service.js', () => ({
  getPosition: vi.fn(),
}));

import { evaluateRule, executeRule } from './ruleExecutor.service.js';
import * as polymarketSkill from '../../skills/polymarketSkill.service.js';
import * as ruleManager from './ruleManager.service.js';
import * as eventLogger from './eventLogger.service.js';
import * as positionMonitor from './positionMonitor.service.js';
import type { RuleLike } from './types.js';

// ── Helpers ──────────────────────────────────────────────────

function makeRule(overrides: Partial<RuleLike> = {}): RuleLike {
  return {
    id: 'rule-1',
    secretId: 'secret-1',
    ruleType: 'STOP_LOSS',
    marketId: 'market-1',
    tokenId: 'token-1',
    side: 'BUY',
    triggerPrice: 0.4,
    trailingPercent: null,
    action: JSON.stringify({ type: 'SELL_ALL' }),
    status: 'TRIGGERED',
    ...overrides,
  };
}

function mockHoldings(shares: number, extra: Record<string, unknown> = {}) {
  vi.mocked(polymarketSkill.getHoldings).mockResolvedValue({
    walletAddress: '0xabc',
    holdings: [
      {
        tokenId: 'token-1',
        conditionId: 'market-1',
        shares,
        averageEntryPrice: 0.5,
        currentPrice: 0.45,
        pnl: -0.5,
        pnlPercent: -10,
        marketTitle: 'Test Market',
        marketSlug: 'test-market',
        outcome: 'Yes',
        ...extra,
      },
    ],
  });
}

// ── Tests ────────────────────────────────────────────────────

describe('evaluateRule', () => {
  it('triggers STOP_LOSS when price <= triggerPrice', () => {
    expect(evaluateRule(makeRule({ ruleType: 'STOP_LOSS', triggerPrice: 0.4 }), 0.4)).toBe(true);
    expect(evaluateRule(makeRule({ ruleType: 'STOP_LOSS', triggerPrice: 0.4 }), 0.35)).toBe(true);
  });

  it('does not trigger STOP_LOSS when price > triggerPrice', () => {
    expect(evaluateRule(makeRule({ ruleType: 'STOP_LOSS', triggerPrice: 0.4 }), 0.45)).toBe(false);
  });

  it('triggers TAKE_PROFIT when price >= triggerPrice', () => {
    expect(evaluateRule(makeRule({ ruleType: 'TAKE_PROFIT', triggerPrice: 0.8 }), 0.8)).toBe(true);
    expect(evaluateRule(makeRule({ ruleType: 'TAKE_PROFIT', triggerPrice: 0.8 }), 0.9)).toBe(true);
  });

  it('does not trigger TAKE_PROFIT when price < triggerPrice', () => {
    expect(evaluateRule(makeRule({ ruleType: 'TAKE_PROFIT', triggerPrice: 0.8 }), 0.75)).toBe(
      false
    );
  });

  it('triggers TRAILING_STOP when price <= triggerPrice', () => {
    expect(
      evaluateRule(makeRule({ ruleType: 'TRAILING_STOP', triggerPrice: 0.5 }), 0.5)
    ).toBe(true);
  });
});

describe('executeRule', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(positionMonitor.getPosition).mockResolvedValue(null);
  });

  it('marks rule FAILED and throws when policy denies the trade', async () => {
    const rule = makeRule();
    mockHoldings(10);
    vi.mocked(polymarketSkill.placeBet).mockResolvedValue({
      status: 'denied',
      reason: 'Exceeds spending limit',
      transactionLogId: 'txlog-1',
      walletAddress: '0xabc',
    });

    await expect(executeRule(rule)).rejects.toThrow('Trade denied by policy: Exceeds spending limit');
    expect(ruleManager.markRuleFailed).toHaveBeenCalledWith(
      'rule-1',
      'Trade denied by policy: Exceeds spending limit'
    );
  });

  it('transitions to PENDING_APPROVAL and logs ACTION_PENDING_APPROVAL event', async () => {
    const rule = makeRule();
    mockHoldings(10);
    vi.mocked(polymarketSkill.placeBet).mockResolvedValue({
      status: 'pending_approval',
      orderId: 'order-pending',
      transactionLogId: 'txlog-2',
      walletAddress: '0xabc',
    });

    const result = await executeRule(rule);

    expect(result).toEqual({ orderId: 'order-pending', executed: false });
    expect(ruleManager.markRulePendingApproval).toHaveBeenCalledWith('rule-1');
    expect(eventLogger.logEvent).toHaveBeenCalledWith('rule-1', 'ACTION_PENDING_APPROVAL', {
      message: 'Trade requires human approval; rule paused until resolved',
    });
    // Should NOT mark as failed or revert to active
    expect(ruleManager.markRuleFailed).not.toHaveBeenCalled();
    expect(ruleManager.revertToActive).not.toHaveBeenCalled();
  });

  it('executes successfully, sets txHash, and logs ACTION_EXECUTED', async () => {
    const rule = makeRule();
    mockHoldings(10);
    vi.mocked(polymarketSkill.placeBet).mockResolvedValue({
      status: 'executed',
      orderId: 'order-123',
      transactionLogId: 'txlog-3',
      walletAddress: '0xabc',
    });

    const result = await executeRule(rule);

    expect(result).toEqual({ orderId: 'order-123', executed: true });
    expect(ruleManager.setTriggerTxHash).toHaveBeenCalledWith('rule-1', 'order-123');
    expect(eventLogger.logEvent).toHaveBeenCalledWith(
      'rule-1',
      'ACTION_EXECUTED',
      expect.objectContaining({ result: expect.objectContaining({ orderId: 'order-123' }) })
    );
  });

  it('does not call setTriggerTxHash when orderId is absent', async () => {
    const rule = makeRule();
    mockHoldings(10);
    vi.mocked(polymarketSkill.placeBet).mockResolvedValue({
      status: 'executed',
      transactionLogId: 'txlog-4',
      walletAddress: '0xabc',
    });

    const result = await executeRule(rule);

    expect(result).toEqual({ orderId: undefined, executed: true });
    expect(ruleManager.setTriggerTxHash).not.toHaveBeenCalled();
  });

  it('marks rule FAILED on invalid action JSON', async () => {
    const rule = makeRule({ action: 'not-json{' });

    await expect(executeRule(rule)).rejects.toThrow('Invalid action JSON');
    expect(ruleManager.markRuleFailed).toHaveBeenCalledWith(
      'rule-1',
      expect.stringContaining('Invalid action JSON')
    );
    expect(eventLogger.logEvent).toHaveBeenCalledWith(
      'rule-1',
      'ACTION_FAILED',
      expect.objectContaining({ isPermanent: true })
    );
  });

  it('marks rule FAILED when no shares are held (SELL_ALL)', async () => {
    const rule = makeRule();
    vi.mocked(polymarketSkill.getHoldings).mockResolvedValue({
      walletAddress: '0xabc',
      holdings: [],
    });

    await expect(executeRule(rule)).rejects.toThrow('No shares found');
    expect(ruleManager.markRuleFailed).toHaveBeenCalledWith(
      'rule-1',
      expect.stringContaining('Cannot execute SELL_ALL')
    );
  });

  it('marks rule FAILED when no shares are held (SELL_PARTIAL)', async () => {
    const rule = makeRule({ action: JSON.stringify({ type: 'SELL_PARTIAL', amount: 5 }) });
    vi.mocked(polymarketSkill.getHoldings).mockResolvedValue({
      walletAddress: '0xabc',
      holdings: [],
    });

    await expect(executeRule(rule)).rejects.toThrow('No shares found');
    expect(ruleManager.markRuleFailed).toHaveBeenCalledWith(
      'rule-1',
      expect.stringContaining('Cannot execute SELL_PARTIAL')
    );
  });

  it('clamps SELL_PARTIAL amount to available shares', async () => {
    const rule = makeRule({ action: JSON.stringify({ type: 'SELL_PARTIAL', amount: 100 }) });
    mockHoldings(10);
    vi.mocked(polymarketSkill.placeBet).mockResolvedValue({
      status: 'executed',
      orderId: 'order-clamped',
      transactionLogId: 'txlog-5',
      walletAddress: '0xabc',
    });

    await executeRule(rule);

    expect(polymarketSkill.placeBet).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 10 })
    );
  });

  it('marks rule FAILED when market is resolved (redeemable position)', async () => {
    const rule = makeRule();
    vi.mocked(positionMonitor.getPosition).mockResolvedValue({
      id: 'pos-1',
      secretId: 'secret-1',
      marketId: 'market-1',
      marketSlug: 'test',
      tokenId: 'token-1',
      side: 'BUY',
      quantity: 10,
      avgEntryPrice: 0.5,
      currentPrice: 0.45,
      marketTitle: 'Test',
      outcome: 'Yes',
      endDate: null,
      redeemable: true,
      lastUpdatedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(executeRule(rule)).rejects.toThrow('Market is resolved and redeemable');
    expect(ruleManager.markRuleFailed).toHaveBeenCalled();
  });
});
