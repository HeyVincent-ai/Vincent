import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { errorHandler } from './middleware/errorHandler.js';
import { createEventsRoutes } from './routes/events.routes.js';
import { createHealthRoutes } from './routes/health.routes.js';
import { createPositionsRoutes } from './routes/positions.routes.js';
import { createRulesRoutes } from './routes/rules.routes.js';
import { createTradesRoutes } from './routes/trades.routes.js';
import type { MonitoringWorker } from '../worker/monitoringWorker.js';
import { RuleManagerService } from '../services/ruleManager.service.js';
import { PositionMonitorService } from '../services/positionMonitor.service.js';
import { EventLoggerService } from '../services/eventLogger.service.js';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const createApp = (
  worker: MonitoringWorker,
  ruleManager: RuleManagerService,
  positionMonitor: PositionMonitorService,
  eventLogger: EventLoggerService
) => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    logger.info({ method: req.method, path: req.path }, 'HTTP request');
    next();
  });

  app.use(createHealthRoutes(worker));
  app.use(createRulesRoutes(ruleManager));
  app.use(createPositionsRoutes(positionMonitor));
  app.use(createEventsRoutes(eventLogger));
  app.use(createTradesRoutes(eventLogger));

  // Serve static files from public directory
  const publicPath = path.join(__dirname, '../../public');
  app.use(express.static(publicPath));

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use(errorHandler);
  return app;
};
