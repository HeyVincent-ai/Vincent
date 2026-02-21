import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createRulesRoutes } from './rules.routes.js';

const makeApp = () => {
  const ruleManager = {
    createRule: vi.fn(async (body) => ({ id: 'r1', status: 'ACTIVE', ...body })),
    getRules: vi.fn(async () => [{ id: 'r1' }]),
    getRule: vi.fn(async () => ({ id: 'r1' })),
    updateRule: vi.fn(async (_id, body) => ({ id: 'r1', ...body })),
    cancelRule: vi.fn(async () => ({ id: 'r1', status: 'CANCELED' })),
  };

  const app = express();
  app.use(express.json());
  app.use(createRulesRoutes(ruleManager as never));
  return { app, ruleManager };
};

describe('rules routes', () => {
  it('creates and manages rules', async () => {
    const { app } = makeApp();

    await request(app)
      .post('/api/rules')
      .send({
        ruleType: 'STOP_LOSS',
        marketId: 'm1',
        tokenId: 't1',
        triggerPrice: 0.4,
        action: { type: 'SELL_ALL' },
      })
      .expect(201);

    await request(app).get('/api/rules').expect(200);
    await request(app).get('/api/rules/r1').expect(200);
    await request(app).patch('/api/rules/r1').send({ triggerPrice: 0.5 }).expect(200);
    await request(app).delete('/api/rules/r1').expect(200);
  });

  it('accepts trailing stop rule creation payload', async () => {
    const { app, ruleManager } = makeApp();

    await request(app)
      .post('/api/rules')
      .send({
        ruleType: 'TRAILING_STOP',
        marketId: 'm1',
        tokenId: 't1',
        triggerPrice: 0.4,
        trailingPercent: 5,
        action: { type: 'SELL_ALL' },
      })
      .expect(201);
    expect(ruleManager.createRule).toHaveBeenCalledWith(
      expect.objectContaining({
        ruleType: 'TRAILING_STOP',
        trailingPercent: 5,
      })
    );
  });
});
