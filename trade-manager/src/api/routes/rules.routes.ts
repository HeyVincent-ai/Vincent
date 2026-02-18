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
    const statusParam = req.query.status;
    const status = Array.isArray(statusParam) ? statusParam[0] : statusParam;
    const rules = await ruleManager.getRules(typeof status === 'string' ? status : undefined);
    res.json(rules);
  });

  router.get('/api/rules/:id', async (req, res) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const rule = await ruleManager.getRule(id);
    res.json(rule);
  });

  router.patch('/api/rules/:id', validateBody(updateRuleSchema), async (req, res) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const rule = await ruleManager.updateRule(id, req.body);
    res.json(rule);
  });

  router.delete('/api/rules/:id', async (req, res) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const rule = await ruleManager.cancelRule(id);
    res.json(rule);
  });

  return router;
};
