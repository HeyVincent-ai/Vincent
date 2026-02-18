import { Router } from 'express';
import { EventLoggerService } from '../../services/eventLogger.service.js';

export const createEventsRoutes = (eventLogger: EventLoggerService): Router => {
  const router = Router();

  router.get('/api/events', async (req, res) => {
    const ruleId = typeof req.query.ruleId === 'string' ? req.query.ruleId : undefined;
    const events = await eventLogger.getEvents(ruleId);
    res.json(events);
  });

  return router;
};
