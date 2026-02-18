import { describe, expect, it, vi } from 'vitest';
import { MonitoringWorker } from './monitoringWorker.js';

describe('monitoring worker', () => {
  it('reports running status and evaluates trigger path', async () => {
    const positionMonitor = {
      updatePositions: vi.fn(async () => []),
      getCurrentPrice: vi.fn(async () => 0.4),
    };
    const ruleManager = {
      getRules: vi.fn(async () => [
        { id: 'r1', ruleType: 'STOP_LOSS', triggerPrice: 0.5, marketId: 'm', tokenId: 't' },
      ]),
      updateTrailingTrigger: vi.fn(async () => false),
    };
    const ruleExecutor = {
      evaluateRule: vi.fn(() => true),
      executeRule: vi.fn(async () => ({ orderId: 'o1' })),
    };
    const eventLogger = { logEvent: vi.fn(async () => ({ id: 'e1' })) };

    const worker = new MonitoringWorker(
      60,
      5,
      60,
      positionMonitor as never,
      ruleManager as never,
      ruleExecutor as never,
      eventLogger as never
    );
    worker.startWorker();
    await new Promise((r) => setTimeout(r, 20));
    worker.stopWorker();

    expect(worker.getStatus().running).toBe(false);
    expect(ruleExecutor.executeRule).toHaveBeenCalled();
  });
});
