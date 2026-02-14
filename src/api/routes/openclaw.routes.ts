/**
 * OpenClaw Deployment Routes
 *
 * POST   /api/openclaw/deploy                  → Create checkout session + deployment
 * GET    /api/openclaw/deployments              → List user's deployments
 * GET    /api/openclaw/deployments/:id          → Get deployment status
 * POST   /api/openclaw/deployments/:id/cancel   → Cancel subscription at period end
 * DELETE /api/openclaw/deployments/:id          → Destroy VPS immediately
 * POST   /api/openclaw/deployments/:id/restart  → Restart OpenClaw
 * POST   /api/openclaw/deployments/:id/retry    → Retry failed deployment
 * POST   /api/openclaw/deployments/:id/reprovision → Reinstall OpenClaw on existing VPS
 * GET    /api/openclaw/deployments/:id/ssh-key  → Download SSH private key
 * GET    /api/openclaw/deployments/:id/usage    → Get LLM token usage stats
 * POST   /api/openclaw/deployments/:id/credits  → Add LLM credits
 * GET    /api/openclaw/deployments/:id/channels → Check configured channels
 * POST   /api/openclaw/deployments/:id/telegram/setup → Configure Telegram bot token
 * POST   /api/openclaw/deployments/:id/telegram/pair  → Approve Telegram pairing code
 * GET    /api/openclaw/deployments/:id/updates        → List config update status
 * POST   /api/openclaw/deployments/:id/updates/apply  → Force-apply pending updates
 * GET    /api/openclaw/deployments/:id/soul            → Get SOUL.md content
 * PUT    /api/openclaw/deployments/:id/soul            → Update SOUL.md
 * GET    /api/openclaw/deployments/:id/memory          → List memory files
 * GET    /api/openclaw/deployments/:id/memory/:filename → Read a memory file
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../types/index.js';
import { sessionAuthMiddleware } from '../middleware/sessionAuth.js';
import { sendSuccess, errors } from '../../utils/response.js';
import * as openclawService from '../../services/openclaw.service.js';
import * as updateService from '../../services/deployment-update.service.js';

const { toPublicData } = openclawService;

const router = Router();

// All routes require session auth
router.use(sessionAuthMiddleware);

const MAX_ACTIVE_DEPLOYMENTS = 3;

const deploySchema = z.object({
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

/**
 * POST /api/openclaw/deploy
 * Create a Stripe Checkout session for a new OpenClaw deployment.
 * Returns { deploymentId, checkoutUrl } for frontend redirect.
 * VPS provisioning only begins after payment is confirmed via Stripe webhook.
 */
router.post('/deploy', async (req: AuthenticatedRequest, res: Response) => {
  const parsed = deploySchema.safeParse(req.body);
  if (!parsed.success) {
    return errors.validation(res, parsed.error.format());
  }

  const userId = req.user!.id;

  try {
    // Limit: max 3 active (non-destroyed, non-error) deployments per user
    const activeCount = await openclawService.listDeployments(userId);
    const activeDeployments = activeCount.filter((d) => !['DESTROYED', 'ERROR'].includes(d.status));
    if (activeDeployments.length >= MAX_ACTIVE_DEPLOYMENTS) {
      return res.status(429).json({
        success: false,
        error: `Maximum ${MAX_ACTIVE_DEPLOYMENTS} active deployments reached. Destroy an existing deployment first.`,
      });
    }

    const { deployment, checkoutUrl } = await openclawService.deploy(
      userId,
      parsed.data.successUrl,
      parsed.data.cancelUrl
    );
    sendSuccess(res, { deploymentId: deployment.id, checkoutUrl }, 201);
  } catch (error: any) {
    console.error('OpenClaw deploy error:', error);
    errors.internal(res);
  }
});

/**
 * GET /api/openclaw/deployments
 * List all deployments for the authenticated user.
 */
router.get('/deployments', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const deployments = await openclawService.listDeployments(req.user!.id);
    sendSuccess(res, { deployments: deployments.map(toPublicData) });
  } catch (error: any) {
    console.error('OpenClaw list error:', error);
    errors.internal(res);
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
    sendSuccess(res, { deployment: toPublicData(deployment) });
  } catch (error: any) {
    console.error('OpenClaw get error:', error);
    errors.internal(res);
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
      deployment: toPublicData(deployment),
      currentPeriodEnd: deployment.currentPeriodEnd,
    });
  } catch (error: any) {
    if (error.message === 'Deployment not found') {
      return errors.notFound(res, 'Deployment');
    }
    console.error('OpenClaw cancel error:', error);
    errors.internal(res);
  }
});

/**
 * DELETE /api/openclaw/deployments/:id
 * Destroy a deployment immediately (cancel subscription + terminate VPS + revoke keys).
 */
router.delete('/deployments/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const deployment = await openclawService.destroy(req.params.id as string, req.user!.id);
    sendSuccess(res, { deployment: toPublicData(deployment) });
  } catch (error: any) {
    if (error.message === 'Deployment not found') {
      return errors.notFound(res, 'Deployment');
    }
    console.error('OpenClaw destroy error:', error);
    errors.internal(res);
  }
});

/**
 * POST /api/openclaw/deployments/:id/restart
 * Restart OpenClaw on the VPS.
 */
router.post('/deployments/:id/restart', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const deployment = await openclawService.restart(req.params.id as string, req.user!.id);
    sendSuccess(res, { deployment: toPublicData(deployment) });
  } catch (error: any) {
    if (error.message.includes('not found')) {
      return errors.notFound(res, 'Deployment');
    }
    console.error('OpenClaw restart error:', error);
    errors.internal(res);
  }
});

/**
 * POST /api/openclaw/deployments/:id/retry
 * Retry a failed deployment. Cleans up partial resources and re-provisions.
 */
router.post('/deployments/:id/retry', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const deployment = await openclawService.retryDeploy(req.params.id as string, req.user!.id);
    sendSuccess(res, { deployment: toPublicData(deployment) });
  } catch (error: any) {
    if (error.message === 'Deployment not found') {
      return errors.notFound(res, 'Deployment');
    }
    if (error.message.includes('only retry') || error.message.includes('no subscription')) {
      return res.status(400).json({ success: false, error: error.message });
    }
    console.error('OpenClaw retry error:', error);
    errors.internal(res);
  }
});

/**
 * POST /api/openclaw/deployments/:id/reprovision
 * Reinstall OpenClaw on an existing VPS without ordering a new one.
 */
router.post('/deployments/:id/reprovision', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const deployment = await openclawService.reprovision(req.params.id as string, req.user!.id);
    sendSuccess(res, { deployment: toPublicData(deployment) });
  } catch (error: any) {
    if (error.message === 'Deployment not found') {
      return errors.notFound(res, 'Deployment');
    }
    if (error.message.includes('Can only reprovision') || error.message.includes('missing VPS')) {
      return res.status(400).json({ success: false, error: error.message });
    }
    console.error('OpenClaw reprovision error:', error);
    errors.internal(res);
  }
});

/**
 * GET /api/openclaw/deployments/:id/ssh-key
 * Download the SSH private key for the deployment's VPS.
 */
router.get('/deployments/:id/ssh-key', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const deployment = await openclawService.getDeployment(req.params.id as string, req.user!.id);
    if (!deployment) {
      return errors.notFound(res, 'Deployment');
    }
    if (!deployment.sshPrivateKey) {
      return res
        .status(400)
        .json({ success: false, error: 'No SSH key available for this deployment' });
    }
    res.setHeader('Content-Type', 'application/x-pem-file');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="openclaw-${deployment.id.slice(-8)}.pem"`
    );
    res.send(deployment.sshPrivateKey);
  } catch (error: any) {
    console.error('OpenClaw ssh-key error:', error);
    errors.internal(res);
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
    errors.internal(res);
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
    errors.internal(res);
  }
});

// ── Telegram Channel Setup ──────────────────────────────────

/**
 * GET /api/openclaw/deployments/:id/channels
 * Check which channels are configured on the deployment.
 */
router.get('/deployments/:id/channels', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const channels = await openclawService.getChannelStatus(req.params.id as string, req.user!.id);
    sendSuccess(res, channels);
  } catch (error: any) {
    if (error.message.includes('not found')) {
      return errors.notFound(res, 'Deployment');
    }
    console.error('OpenClaw channels error:', error);
    errors.internal(res);
  }
});

const telegramSetupSchema = z.object({
  botToken: z.string().min(20).max(100),
});

/**
 * POST /api/openclaw/deployments/:id/telegram/setup
 * Configure Telegram bot token and restart gateway.
 */
router.post('/deployments/:id/telegram/setup', async (req: AuthenticatedRequest, res: Response) => {
  const parsed = telegramSetupSchema.safeParse(req.body);
  if (!parsed.success) {
    return errors.validation(res, parsed.error.format());
  }

  try {
    await openclawService.configureTelegramBot(
      req.params.id as string,
      req.user!.id,
      parsed.data.botToken
    );
    sendSuccess(res, { message: 'Telegram bot configured and gateway restarting' });
  } catch (error: any) {
    if (error.message.includes('not found')) {
      return errors.notFound(res, 'Deployment');
    }
    if (error.message.includes('Invalid')) {
      return errors.badRequest(res, error.message);
    }
    console.error('OpenClaw telegram setup error:', error);
    errors.internal(res);
  }
});

const telegramPairSchema = z.object({
  code: z.string().min(1).max(50),
});

/**
 * POST /api/openclaw/deployments/:id/telegram/pair
 * Approve a Telegram pairing code.
 */
router.post('/deployments/:id/telegram/pair', async (req: AuthenticatedRequest, res: Response) => {
  const parsed = telegramPairSchema.safeParse(req.body);
  if (!parsed.success) {
    return errors.validation(res, parsed.error.format());
  }

  try {
    const result = await openclawService.approveTelegramPairing(
      req.params.id as string,
      req.user!.id,
      parsed.data.code
    );
    sendSuccess(res, result);
  } catch (error: any) {
    if (error.message.includes('not found')) {
      return errors.notFound(res, 'Deployment');
    }
    if (error.message.includes('Invalid')) {
      return errors.badRequest(res, error.message);
    }
    console.error('OpenClaw telegram pair error:', error);
    errors.internal(res);
  }
});

// ============================================================
// Config Update Endpoints
// ============================================================

/**
 * GET /api/openclaw/deployments/:id/updates
 * Get config update status for a deployment.
 */
router.get('/deployments/:id/updates', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const deployment = await openclawService.getDeployment(req.params.id as string, req.user!.id);
    if (!deployment) return errors.notFound(res, 'Deployment');

    const status = await updateService.getUpdateStatus(deployment.id);
    sendSuccess(res, status);
  } catch (error: any) {
    console.error('OpenClaw get updates error:', error);
    errors.internal(res);
  }
});

/**
 * POST /api/openclaw/deployments/:id/updates/apply
 * Force-apply all pending config updates to a deployment.
 */
router.post('/deployments/:id/updates/apply', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const deployment = await openclawService.getDeployment(req.params.id as string, req.user!.id);
    if (!deployment) return errors.notFound(res, 'Deployment');

    const result = await updateService.applyPendingUpdates(deployment.id);
    sendSuccess(res, result);
  } catch (error: any) {
    if (error.message.includes('not found')) {
      return errors.notFound(res, 'Deployment');
    }
    console.error('OpenClaw apply updates error:', error);
    errors.internal(res);
  }
});

// ============================================================
// SOUL.md Personality Endpoints
// ============================================================

const soulSchema = z.object({
  content: z.string().max(50000),
});

/**
 * GET /api/openclaw/deployments/:id/soul
 * Get SOUL.md content for a deployment.
 */
router.get('/deployments/:id/soul', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const deployment = await openclawService.getDeployment(req.params.id as string, req.user!.id);
    if (!deployment) return errors.notFound(res, 'Deployment');

    sendSuccess(res, { content: deployment.soulMd || '' });
  } catch (error: any) {
    console.error('OpenClaw get soul error:', error);
    errors.internal(res);
  }
});

/**
 * PUT /api/openclaw/deployments/:id/soul
 * Update SOUL.md content — saves to DB and pushes to VPS.
 */
router.put('/deployments/:id/soul', async (req: AuthenticatedRequest, res: Response) => {
  const parsed = soulSchema.safeParse(req.body);
  if (!parsed.success) return errors.validation(res, parsed.error.format());

  try {
    const result = await openclawService.updateSoulMd(
      req.params.id as string,
      req.user!.id,
      parsed.data.content
    );
    sendSuccess(res, { content: result.soulMd || '' });
  } catch (error: any) {
    if (error.message.includes('not found')) {
      return errors.notFound(res, 'Deployment');
    }
    console.error('OpenClaw update soul error:', error);
    errors.internal(res);
  }
});

// ============================================================
// Memory File Endpoints
// ============================================================

/**
 * GET /api/openclaw/deployments/:id/memory
 * List memory files on the VPS.
 */
router.get('/deployments/:id/memory', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const files = await openclawService.listMemoryFiles(req.params.id as string, req.user!.id);
    sendSuccess(res, { files });
  } catch (error: any) {
    if (error.message.includes('not found')) {
      return errors.notFound(res, 'Deployment');
    }
    console.error('OpenClaw list memory error:', error);
    errors.internal(res);
  }
});

/**
 * GET /api/openclaw/deployments/:id/memory/:filename
 * Read a specific memory file from the VPS.
 */
router.get(
  '/deployments/:id/memory/:filename',
  async (req: AuthenticatedRequest, res: Response) => {
    const filename = req.params.filename as string;

    // Prevent path traversal
    if (filename.includes('..') || filename.includes('/')) {
      return errors.badRequest(res, 'Invalid filename');
    }

    try {
      const content = await openclawService.readMemoryFile(
        req.params.id as string,
        req.user!.id,
        filename
      );
      sendSuccess(res, { filename, content });
    } catch (error: any) {
      if (error.message.includes('not found')) {
        return errors.notFound(res, 'Deployment');
      }
      if (error.message.includes('does not exist')) {
        return errors.notFound(res, 'File');
      }
      console.error('OpenClaw read memory error:', error);
      errors.internal(res);
    }
  }
);

// ============================================================
// Scheduled Tasks (opt-in crons that use LLM credits)
// ============================================================

const toggleTaskSchema = z.object({
  enabled: z.boolean(),
});

/**
 * GET /api/openclaw/deployments/:id/tasks
 * Get status of opt-in scheduled tasks.
 */
router.get('/deployments/:id/tasks', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tasks = await openclawService.getScheduledTasks(req.params.id as string, req.user!.id);
    sendSuccess(res, { tasks });
  } catch (error: any) {
    if (error.message.includes('not found')) return errors.notFound(res, 'Deployment');
    console.error('OpenClaw get tasks error:', error);
    errors.internal(res);
  }
});

/**
 * PUT /api/openclaw/deployments/:id/tasks/:taskName
 * Enable or disable a scheduled task.
 */
router.put('/deployments/:id/tasks/:taskName', async (req: AuthenticatedRequest, res: Response) => {
  const parsed = toggleTaskSchema.safeParse(req.body);
  if (!parsed.success) return errors.validation(res, parsed.error.format());

  try {
    await openclawService.toggleScheduledTask(
      req.params.id as string,
      req.user!.id,
      req.params.taskName as string,
      parsed.data.enabled
    );
    sendSuccess(res, { taskName: req.params.taskName, enabled: parsed.data.enabled });
  } catch (error: any) {
    if (error.message.includes('not found')) return errors.notFound(res, 'Deployment');
    if (error.message.includes('Unknown task')) return errors.badRequest(res, error.message);
    console.error('OpenClaw toggle task error:', error);
    errors.internal(res);
  }
});

export default router;
