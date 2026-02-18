import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createPositionsRoutes } from './positions.routes.js';

describe('positions routes', () => {
  it('gets positions', async () => {
    const service = { getPositions: vi.fn(async () => [{ marketId: 'm1' }]) };
    const app = express();
    app.use(createPositionsRoutes(service as never));

    const response = await request(app).get('/api/positions').expect(200);
    expect(response.body).toEqual([{ marketId: 'm1' }]);
  });
});
