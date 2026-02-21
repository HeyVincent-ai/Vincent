import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../../types/index.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { sendSuccess, errors } from '../../utils/response.js';
import {
  ruleManager,
  eventLogger,
  positionMonitor,
  getWorkerStatus,
} from '../../services/tradeManager/index.js';

const router = Router();

// ============================================================
// POST /rules — Create a trade rule
// ============================================================

router.post(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.secret) {
      errors.unauthorized(res, 'No secret associated with API key');
      return;
    }

    const rule = await ruleManager.createRule(req.secret.id, req.body);
    sendSuccess(res, rule, 201);
  })
);

// ============================================================
// GET /rules — List rules for this secret
// ============================================================

router.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.secret) {
      errors.unauthorized(res, 'No secret associated with API key');
      return;
    }

    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const rules = await ruleManager.getRules(req.secret.id, status);
    sendSuccess(res, { rules });
  })
);

// ============================================================
// GET /rules/events — Event log
// ============================================================

router.get(
  '/events',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.secret) {
      errors.unauthorized(res, 'No secret associated with API key');
      return;
    }

    const ruleId = typeof req.query.ruleId === 'string' ? req.query.ruleId : undefined;
    const parsedLimit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 100;
    const parsedOffset = typeof req.query.offset === 'string' ? parseInt(req.query.offset, 10) : 0;
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 500) : 100;
    const offset = Number.isFinite(parsedOffset) ? Math.max(parsedOffset, 0) : 0;

    // If a ruleId is specified, verify it belongs to this secret
    if (ruleId) {
      await ruleManager.getRule(req.secret.id, ruleId);
    }

    // Always scope by secretId to prevent cross-tenant data leakage
    const events = await eventLogger.getEvents({ ruleId, secretId: req.secret.id }, limit, offset);
    sendSuccess(res, { events });
  })
);

// ============================================================
// GET /rules/positions — Monitored positions for this secret
// ============================================================

router.get(
  '/positions',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.secret) {
      errors.unauthorized(res, 'No secret associated with API key');
      return;
    }

    const positions = await positionMonitor.getPositions(req.secret.id);
    sendSuccess(res, { positions });
  })
);

// ============================================================
// GET /rules/status — Worker status
// ============================================================

router.get(
  '/status',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.secret) {
      errors.unauthorized(res, 'No secret associated with API key');
      return;
    }

    sendSuccess(res, getWorkerStatus());
  })
);

// ============================================================
// GET /rules/:id — Get single rule
// ============================================================

router.get(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.secret) {
      errors.unauthorized(res, 'No secret associated with API key');
      return;
    }

    const { id } = req.params as Record<string, string>;
    const rule = await ruleManager.getRule(req.secret.id, id);
    sendSuccess(res, rule);
  })
);

// ============================================================
// PATCH /rules/:id — Update trigger price
// ============================================================

router.patch(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.secret) {
      errors.unauthorized(res, 'No secret associated with API key');
      return;
    }

    const { id } = req.params as Record<string, string>;
    const rule = await ruleManager.updateRule(req.secret.id, id, req.body);
    sendSuccess(res, rule);
  })
);

// ============================================================
// DELETE /rules/:id — Cancel rule
// ============================================================

router.delete(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.secret) {
      errors.unauthorized(res, 'No secret associated with API key');
      return;
    }

    const { id } = req.params as Record<string, string>;
    const rule = await ruleManager.cancelRule(req.secret.id, id);
    sendSuccess(res, rule);
  })
);

export default router;
