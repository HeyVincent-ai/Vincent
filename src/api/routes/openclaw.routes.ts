/**
 * OpenClaw Deployment Routes
 *
 * POST   /api/openclaw/deploy                  → Create checkout session + deployment
 * GET    /api/openclaw/deployments              → List user's deployments
 * GET    /api/openclaw/deployments/:id          → Get deployment status
 * POST   /api/openclaw/deployments/:id/cancel   → Cancel subscription at period end
 * DELETE /api/openclaw/deployments/:id          → Destroy VPS immediately
 * POST   /api/openclaw/deployments/:id/restart  → Restart OpenClaw
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../types/index.js';
import { sessionAuthMiddleware } from '../middleware/sessionAuth.js';
import { sendSuccess, errors } from '../../utils/response.js';
import * as openclawService from '../../services/openclaw.service.js';

const router = Router();

// All routes require session auth
router.use(sessionAuthMiddleware);

const deploySchema = z.object({
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

/**
 * POST /api/openclaw/deploy
 * Create a Stripe Checkout session for a new OpenClaw deployment.
 * Returns { deploymentId, checkoutUrl } for frontend redirect.
 */
router.post('/deploy', async (req: AuthenticatedRequest, res: Response) => {
  const parsed = deploySchema.safeParse(req.body);
  if (!parsed.success) {
    return errors.validation(res, parsed.error.format());
  }

  try {
    const { deployment, checkoutUrl } = await openclawService.deploy(
      req.user!.id,
      parsed.data.successUrl,
      parsed.data.cancelUrl
    );
    sendSuccess(res, { deploymentId: deployment.id, checkoutUrl }, 201);
  } catch (error: any) {
    console.error('OpenClaw deploy error:', error);
    errors.internal(res, error.message);
  }
});

/**
 * GET /api/openclaw/deployments
 * List all deployments for the authenticated user.
 */
router.get('/deployments', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const deployments = await openclawService.listDeployments(req.user!.id);
    sendSuccess(res, { deployments });
  } catch (error: any) {
    console.error('OpenClaw list error:', error);
    errors.internal(res, error.message);
  }
});

/**
 * GET /api/openclaw/deployments/:id
 * Get deployment status and details.
 */
router.get('/deployments/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const deployment = await openclawService.getDeployment(req.params.id as string, req.user!.id);
    if (!deployment) {
      return errors.notFound(res, 'Deployment');
    }
    sendSuccess(res, { deployment });
  } catch (error: any) {
    console.error('OpenClaw get error:', error);
    errors.internal(res, error.message);
  }
});

/**
 * POST /api/openclaw/deployments/:id/cancel
 * Cancel subscription at period end. VPS stays running until expiry.
 */
router.post('/deployments/:id/cancel', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const deployment = await openclawService.cancel(req.params.id as string, req.user!.id);
    sendSuccess(res, {
      deployment,
      currentPeriodEnd: deployment.currentPeriodEnd,
    });
  } catch (error: any) {
    if (error.message === 'Deployment not found') {
      return errors.notFound(res, 'Deployment');
    }
    console.error('OpenClaw cancel error:', error);
    errors.internal(res, error.message);
  }
});

/**
 * DELETE /api/openclaw/deployments/:id
 * Destroy a deployment immediately (cancel subscription + terminate VPS + revoke keys).
 */
router.delete('/deployments/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const deployment = await openclawService.destroy(req.params.id as string, req.user!.id);
    sendSuccess(res, { deployment });
  } catch (error: any) {
    if (error.message === 'Deployment not found') {
      return errors.notFound(res, 'Deployment');
    }
    console.error('OpenClaw destroy error:', error);
    errors.internal(res, error.message);
  }
});

/**
 * POST /api/openclaw/deployments/:id/restart
 * Restart OpenClaw on the VPS.
 */
router.post('/deployments/:id/restart', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const deployment = await openclawService.restart(req.params.id as string, req.user!.id);
    sendSuccess(res, { deployment });
  } catch (error: any) {
    if (error.message.includes('not found')) {
      return errors.notFound(res, 'Deployment');
    }
    console.error('OpenClaw restart error:', error);
    errors.internal(res, error.message);
  }
});

/**
 * GET /api/openclaw/deployments/:id/usage
 * Get LLM token usage stats. Polls OpenRouter if stale (>60s).
 */
router.get('/deployments/:id/usage', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const usage = await openclawService.getUsage(req.params.id as string, req.user!.id);
    sendSuccess(res, usage);
  } catch (error: any) {
    if (error.message === 'Deployment not found') {
      return errors.notFound(res, 'Deployment');
    }
    console.error('OpenClaw usage error:', error);
    errors.internal(res, error.message);
  }
});

const creditsSchema = z.object({
  amountUsd: z.number().min(5).max(500),
});

/**
 * POST /api/openclaw/deployments/:id/credits
 * Add LLM credits by charging the user's Stripe payment method.
 */
router.post('/deployments/:id/credits', async (req: AuthenticatedRequest, res: Response) => {
  const parsed = creditsSchema.safeParse(req.body);
  if (!parsed.success) {
    return errors.validation(res, parsed.error.format());
  }

  try {
    const result = await openclawService.addCredits(
      req.params.id as string,
      req.user!.id,
      parsed.data.amountUsd
    );
    sendSuccess(res, result);
  } catch (error: any) {
    if (error.message === 'Deployment not found') {
      return errors.notFound(res, 'Deployment');
    }
    console.error('OpenClaw credits error:', error);
    errors.internal(res, error.message);
  }
});

export default router;
