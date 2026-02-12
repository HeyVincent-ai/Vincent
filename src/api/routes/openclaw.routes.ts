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
 * POST   /api/openclaw/deployments/:id/deposit-wallets → Register deposit wallet
 * GET    /api/openclaw/deployments/:id/deposit-wallets  → List deposit wallets
 * DELETE /api/openclaw/deployments/:id/deposit-wallets/:wid → Revoke deposit wallet
 * GET    /api/openclaw/deployments/:id/deposit-info    → Get deposit address + instructions
 * GET    /api/openclaw/deployments/:id/deposits        → List crypto deposits
 * GET    /api/openclaw/deployments/:id/channels → Check configured channels
 * POST   /api/openclaw/deployments/:id/telegram/setup → Configure Telegram bot token
 * POST   /api/openclaw/deployments/:id/telegram/pair  → Approve Telegram pairing code
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../types/index.js';
import { sessionAuthMiddleware } from '../middleware/sessionAuth.js';
import { sendSuccess, errors } from '../../utils/response.js';
import * as openclawService from '../../services/openclaw.service.js';
import * as depositWalletService from '../../services/depositWallet.service.js';
import prisma from '../../db/client.js';
import { env } from '../../utils/env.js';

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
    const activeDeployments = activeCount.filter(
      d => !['DESTROYED', 'ERROR'].includes(d.status)
    );
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
      return res.status(400).json({ success: false, error: 'No SSH key available for this deployment' });
    }
    res.setHeader('Content-Type', 'application/x-pem-file');
    res.setHeader('Content-Disposition', `attachment; filename="openclaw-${deployment.id.slice(-8)}.pem"`);
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

// ── USDC Deposit Wallets & Credits ───────────────────────────

const depositWalletSchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
  label: z.string().max(100).optional(),
});

/**
 * POST /api/openclaw/deployments/:id/deposit-wallets
 * Register a wallet address for USDC deposit attribution.
 */
router.post('/deployments/:id/deposit-wallets', async (req: AuthenticatedRequest, res: Response) => {
  const parsed = depositWalletSchema.safeParse(req.body);
  if (!parsed.success) {
    return errors.validation(res, parsed.error.format());
  }

  try {
    const wallet = await depositWalletService.registerWallet(
      req.user!.id,
      req.params.id as string,
      parsed.data.address,
      parsed.data.label
    );
    sendSuccess(res, { wallet }, 201);
  } catch (error: any) {
    if (error.message === 'Deployment not found') {
      return errors.notFound(res, 'Deployment');
    }
    if (error.message === 'Invalid Ethereum address') {
      return errors.badRequest(res, error.message);
    }
    // Unique constraint violation — address already registered
    if (error?.code === 'P2002') {
      return errors.conflict(res, 'This wallet address is already registered');
    }
    console.error('Deposit wallet register error:', error);
    errors.internal(res);
  }
});

/**
 * GET /api/openclaw/deployments/:id/deposit-wallets
 * List registered deposit wallets for a deployment.
 */
router.get('/deployments/:id/deposit-wallets', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const wallets = await depositWalletService.listWallets(req.user!.id, req.params.id as string);
    sendSuccess(res, { wallets });
  } catch (error: any) {
    console.error('Deposit wallet list error:', error);
    errors.internal(res);
  }
});

/**
 * DELETE /api/openclaw/deployments/:id/deposit-wallets/:wid
 * Revoke a deposit wallet registration.
 */
router.delete('/deployments/:id/deposit-wallets/:wid', async (req: AuthenticatedRequest, res: Response) => {
  try {
    await depositWalletService.revokeWallet(req.user!.id, req.params.wid as string);
    sendSuccess(res, { message: 'Wallet registration revoked' });
  } catch (error: any) {
    if (error.message === 'Wallet not found') {
      return errors.notFound(res, 'Wallet');
    }
    console.error('Deposit wallet revoke error:', error);
    errors.internal(res);
  }
});

/**
 * GET /api/openclaw/deployments/:id/deposit-info
 * Get the USDC deposit address and chain info.
 */
router.get('/deployments/:id/deposit-info', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const deployment = await openclawService.getDeployment(req.params.id as string, req.user!.id);
    if (!deployment) {
      return errors.notFound(res, 'Deployment');
    }

    sendSuccess(res, {
      depositAddress: env.USDC_DEPOSIT_ADDRESS || null,
      chain: 'Base',
      chainId: 8453,
      token: 'USDC',
      tokenAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      instructions: env.USDC_DEPOSIT_ADDRESS
        ? 'Send USDC on Base to the deposit address from a registered wallet. Credits are applied automatically within ~60 seconds.'
        : 'Crypto deposits are not configured. Use Stripe to add credits.',
    });
  } catch (error: any) {
    console.error('Deposit info error:', error);
    errors.internal(res);
  }
});

/**
 * GET /api/openclaw/deployments/:id/deposits
 * List crypto deposits for a deployment.
 */
router.get('/deployments/:id/deposits', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const deployment = await openclawService.getDeployment(req.params.id as string, req.user!.id);
    if (!deployment) {
      return errors.notFound(res, 'Deployment');
    }

    const deposits = await prisma.cryptoDeposit.findMany({
      where: { deploymentId: req.params.id as string },
      orderBy: { createdAt: 'desc' },
    });

    sendSuccess(res, {
      deposits: deposits.map((d) => ({
        id: d.id,
        txHash: d.txHash,
        blockNumber: d.blockNumber.toString(),
        fromAddress: d.fromAddress,
        amountUsdc: Number(d.amountUsdc),
        amountCredited: Number(d.amountCredited),
        createdAt: d.createdAt,
      })),
    });
  } catch (error: any) {
    console.error('Deposits list error:', error);
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

export default router;
