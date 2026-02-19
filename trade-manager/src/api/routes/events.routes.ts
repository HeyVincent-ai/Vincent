import { Router } from 'express';
import { EventLoggerService } from '../../services/eventLogger.service.js';

export const createEventsRoutes = (eventLogger: EventLoggerService): Router => {
  const router = Router();

  router.get('/api/events', async (req, res) => {
    const ruleId = typeof req.query.ruleId === 'string' ? req.query.ruleId : undefined;
    const limit = Math.min(Math.max(parseInt(String(req.query.limit)) || 100, 1), 1000);
    const offset = Math.max(parseInt(String(req.query.offset)) || 0, 0);
    const events = await eventLogger.getEvents(ruleId, limit, offset);
    res.json(events);
  });

  return router;
};
