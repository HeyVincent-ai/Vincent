import { Router } from 'express';
import { PositionMonitorService } from '../../services/positionMonitor.service.js';

export const createPositionsRoutes = (positionMonitor: PositionMonitorService): Router => {
  const router = Router();

  router.get('/api/positions', async (_req, res) => {
    const positions = await positionMonitor.getPositions();
    res.json(positions);
  });

  return router;
};
