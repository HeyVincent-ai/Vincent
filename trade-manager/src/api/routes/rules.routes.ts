import { Router } from 'express';
import { validateBody } from '../middleware/validate.js';
import {
  createRuleSchema,
  RuleManagerService,
  updateRuleSchema,
} from '../../services/ruleManager.service.js';

export const createRulesRoutes = (ruleManager: RuleManagerService): Router => {
  const router = Router();

  router.post('/api/rules', validateBody(createRuleSchema), async (req, res) => {
    const rule = await ruleManager.createRule(req.body);
    res.status(201).json(rule);
  });

  router.get('/api/rules', async (req, res) => {
    const status = Array.isArray(req.query.status) ? req.query.status[0] : req.query.status;
    const rules = await ruleManager.getRules(status);
    res.json(rules);
  });

  router.get('/api/rules/:id', async (req, res) => {
    const rule = await ruleManager.getRule(req.params.id);
    res.json(rule);
  });

  router.patch('/api/rules/:id', validateBody(updateRuleSchema), async (req, res) => {
    const rule = await ruleManager.updateRule(req.params.id, req.body);
    res.json(rule);
  });

  router.delete('/api/rules/:id', async (req, res) => {
    const rule = await ruleManager.cancelRule(req.params.id);
    res.json(rule);
  });

  return router;
};
