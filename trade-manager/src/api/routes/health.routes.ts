import { Router } from 'express';
import type { MonitoringWorker } from '../../worker/monitoringWorker.js';

export const createHealthRoutes = (worker: MonitoringWorker): Router => {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', version: '0.1.0' });
  });

  router.get('/status', (_req, res) => {
    res.json(worker.getStatus());
  });

  return router;
};
