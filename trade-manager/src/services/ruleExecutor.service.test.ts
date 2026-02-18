import { describe, expect, it } from 'vitest';
import { RuleExecutorService } from './ruleExecutor.service.js';

describe('RuleExecutorService.evaluateRule', () => {
  const service = new RuleExecutorService({} as never, {} as never, {} as never, {} as never);

  it('treats trailing stop like stop loss for trigger evaluation', () => {
    const shouldTrigger = service.evaluateRule(
      {
        id: 'r1',
        ruleType: 'TRAILING_STOP',
        triggerPrice: 0.6,
        action: '{"type":"SELL_ALL"}',
        marketId: 'm1',
        tokenId: 't1',
      },
      0.59
    );

    expect(shouldTrigger).toBe(true);
  });
});
