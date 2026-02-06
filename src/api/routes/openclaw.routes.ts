/**
 * OpenClaw Deployment Routes
 *
 * POST   /api/openclaw/deploy          → Kick off VPS provisioning
 * GET    /api/openclaw/deployments      → List user's deployments
 * GET    /api/openclaw/deployments/:id  → Get deployment status
 * DELETE /api/openclaw/deployments/:id  → Destroy VPS
 * POST   /api/openclaw/deployments/:id/restart → Restart OpenClaw
 */

import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../../types/index.js';
import { sessionAuthMiddleware } from '../middleware/sessionAuth.js';
import { sendSuccess, errors } from '../../utils/response.js';
import * as openclawService from '../../services/openclaw.service.js';

const router = Router();

// All routes require session auth
router.use(sessionAuthMiddleware);

/**
 * POST /api/openclaw/deploy
 * Kick off a new OpenClaw VPS deployment.
 */
router.post('/deploy', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const deployment = await openclawService.deploy(req.user!.id);
    sendSuccess(res, { deployment }, 201);
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
 * DELETE /api/openclaw/deployments/:id
 * Destroy a deployment (terminate VPS + revoke keys).
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

export default router;
