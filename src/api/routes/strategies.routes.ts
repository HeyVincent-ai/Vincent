import { Router, Response } from 'express';
import { z } from 'zod';
import { StrategyType, RiskProfile, StrategyStatus, TriggerType } from '@prisma/client';
import { asyncHandler } from '../middleware/errorHandler.js';
import { sessionAuthMiddleware, requireDeploymentOwnership } from '../middleware/sessionAuth.js';
import { AuthenticatedRequest } from '../../types/index.js';
import { sendSuccess, errors } from '../../utils/response.js';
import * as strategyService from '../../services/strategy.service.js';
import { auditService } from '../../audit/index.js';
import { STRATEGY_TEMPLATES, getTemplatesByType } from '../../constants/strategy-templates.js';

const router = Router({ mergeParams: true });

// ============================================================
// Validation Schemas
// ============================================================

const createStrategyBody = z.object({
  strategyType: z.nativeEnum(StrategyType),
  templateId: z.string().nullable().optional(),
  thesisText: z.string().min(1).max(5000),
  conditionTokenId: z.string().nullable().optional(),
  strategyConfig: z.record(z.string(), z.unknown()),
  riskProfile: z.nativeEnum(RiskProfile).optional(),
});

const updateStrategyBody = z.object({
  thesisText: z.string().min(1).max(5000).optional(),
  conditionTokenId: z.string().nullable().optional(),
  strategyConfig: z.record(z.string(), z.unknown()).optional(),
  riskProfile: z.nativeEnum(RiskProfile).optional(),
  status: z.nativeEnum(StrategyStatus).optional(),
});

const createAlertRuleBody = z.object({
  triggerType: z.nativeEnum(TriggerType),
  triggerConfig: z.unknown(),
  instruction: z.string().min(1).max(5000),
  enabled: z.boolean().optional(),
});

const updateAlertRuleBody = z.object({
  triggerConfig: z.unknown().optional(),
  instruction: z.string().min(1).max(5000).optional(),
  enabled: z.boolean().optional(),
});

// ============================================================
// Template Catalog (no auth required)
// ============================================================

/**
 * GET /api/openclaw/deployments/:deploymentId/strategies/templates
 * Return the strategy template catalog
 */
router.get(
  '/templates',
  asyncHandler(async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    sendSuccess(res, {
      templates: STRATEGY_TEMPLATES,
      polymarket: getTemplatesByType('POLYMARKET'),
      custom: getTemplatesByType('CUSTOM'),
    });
  })
);

// ============================================================
// Strategy CRUD (requires auth + deployment ownership)
// ============================================================

/**
 * GET /api/openclaw/deployments/:deploymentId/strategies
 * List all strategies for a deployment
 */
router.get(
  '/',
  sessionAuthMiddleware,
  requireDeploymentOwnership,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { deploymentId } = req.params as Record<string, string>;
    const strategies = await strategyService.listStrategies(deploymentId);
    sendSuccess(res, { strategies });
  })
);

/**
 * POST /api/openclaw/deployments/:deploymentId/strategies
 * Create a new strategy (auto-creates default alerts from template)
 */
router.post(
  '/',
  sessionAuthMiddleware,
  requireDeploymentOwnership,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { deploymentId } = req.params as Record<string, string>;
    const body = createStrategyBody.parse(req.body);

    const strategy = await strategyService.createStrategy({
      deploymentId,
      ...body,
    });

    auditService.log({
      userId: req.user?.id,
      action: 'strategy.create',
      inputData: {
        deploymentId,
        strategyType: body.strategyType,
        templateId: body.templateId,
      },
      outputData: { strategyId: strategy.id },
      status: 'SUCCESS',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    sendSuccess(res, { strategy }, 201);
  })
);

/**
 * GET /api/openclaw/deployments/:deploymentId/strategies/:strategyId
 * Get a strategy with its alert rules
 */
router.get(
  '/:strategyId',
  sessionAuthMiddleware,
  requireDeploymentOwnership,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { deploymentId, strategyId } = req.params as Record<string, string>;
    const strategy = await strategyService.getStrategy(strategyId, deploymentId);

    if (!strategy) {
      errors.notFound(res, 'Strategy');
      return;
    }

    sendSuccess(res, { strategy });
  })
);

/**
 * PUT /api/openclaw/deployments/:deploymentId/strategies/:strategyId
 * Update a strategy
 */
router.put(
  '/:strategyId',
  sessionAuthMiddleware,
  requireDeploymentOwnership,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { deploymentId, strategyId } = req.params as Record<string, string>;
    const body = updateStrategyBody.parse(req.body);

    const strategy = await strategyService.updateStrategy(strategyId, deploymentId, body);

    auditService.log({
      userId: req.user?.id,
      action: 'strategy.update',
      inputData: { deploymentId, strategyId, ...body },
      outputData: { strategyId: strategy.id },
      status: 'SUCCESS',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    sendSuccess(res, { strategy });
  })
);

/**
 * DELETE /api/openclaw/deployments/:deploymentId/strategies/:strategyId
 * Delete a strategy (cascades to alert rules)
 */
router.delete(
  '/:strategyId',
  sessionAuthMiddleware,
  requireDeploymentOwnership,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { deploymentId, strategyId } = req.params as Record<string, string>;

    await strategyService.deleteStrategy(strategyId, deploymentId);

    auditService.log({
      userId: req.user?.id,
      action: 'strategy.delete',
      inputData: { deploymentId, strategyId },
      status: 'SUCCESS',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    sendSuccess(res, { message: 'Strategy deleted successfully' });
  })
);

// ============================================================
// AlertRule CRUD (nested under strategy)
// ============================================================

/**
 * GET /api/openclaw/deployments/:deploymentId/strategies/:strategyId/alerts
 * List alert rules for a strategy
 */
router.get(
  '/:strategyId/alerts',
  sessionAuthMiddleware,
  requireDeploymentOwnership,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { deploymentId, strategyId } = req.params as Record<string, string>;
    const alertRules = await strategyService.listAlertRules(strategyId, deploymentId);
    sendSuccess(res, { alertRules });
  })
);

/**
 * POST /api/openclaw/deployments/:deploymentId/strategies/:strategyId/alerts
 * Create an alert rule
 */
router.post(
  '/:strategyId/alerts',
  sessionAuthMiddleware,
  requireDeploymentOwnership,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { deploymentId, strategyId } = req.params as Record<string, string>;
    const body = createAlertRuleBody.parse(req.body);

    const alertRule = await strategyService.createAlertRule(strategyId, deploymentId, body);

    auditService.log({
      userId: req.user?.id,
      action: 'alertRule.create',
      inputData: { deploymentId, strategyId, triggerType: body.triggerType },
      outputData: { alertRuleId: alertRule.id },
      status: 'SUCCESS',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    sendSuccess(res, { alertRule }, 201);
  })
);

/**
 * PUT /api/openclaw/deployments/:deploymentId/strategies/:strategyId/alerts/:alertId
 * Update an alert rule
 */
router.put(
  '/:strategyId/alerts/:alertId',
  sessionAuthMiddleware,
  requireDeploymentOwnership,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { deploymentId, strategyId, alertId } = req.params as Record<string, string>;
    const body = updateAlertRuleBody.parse(req.body);

    const alertRule = await strategyService.updateAlertRule(
      alertId,
      strategyId,
      deploymentId,
      body
    );

    auditService.log({
      userId: req.user?.id,
      action: 'alertRule.update',
      inputData: { deploymentId, strategyId, alertId, ...body },
      outputData: { alertRuleId: alertRule.id },
      status: 'SUCCESS',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    sendSuccess(res, { alertRule });
  })
);

/**
 * DELETE /api/openclaw/deployments/:deploymentId/strategies/:strategyId/alerts/:alertId
 * Delete an alert rule
 */
router.delete(
  '/:strategyId/alerts/:alertId',
  sessionAuthMiddleware,
  requireDeploymentOwnership,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { deploymentId, strategyId, alertId } = req.params as Record<string, string>;

    await strategyService.deleteAlertRule(alertId, strategyId, deploymentId);

    auditService.log({
      userId: req.user?.id,
      action: 'alertRule.delete',
      inputData: { deploymentId, strategyId, alertId },
      status: 'SUCCESS',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    sendSuccess(res, { message: 'Alert rule deleted successfully' });
  })
);

export default router;
