import { Router, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler.js';
import { sessionAuthMiddleware } from '../middleware/sessionAuth.js';
import { AuthenticatedRequest } from '../../types/index.js';
import { sendSuccess, errors } from '../../utils/response.js';
import prisma from '../../db/client.js';

const router = Router();

// All admin routes require session auth + Stytch "admin" role
router.use(sessionAuthMiddleware);
router.use((req: AuthenticatedRequest, res: Response, next) => {
  if (!req.user || !req.stytchRoles?.includes('admin')) {
    errors.forbidden(res, 'Admin access required');
    return;
  }
  next();
});

/**
 * GET /api/admin/referrals
 * Get all referrals with referrer and referred user info
 */
router.get(
  '/referrals',
  asyncHandler(async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    const referrals = await prisma.referral.findMany({
      include: {
        referrer: { select: { id: true, email: true, createdAt: true } },
        referredUser: { select: { id: true, email: true, createdAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Aggregate stats
    const total = referrals.length;
    const pending = referrals.filter((r) => r.status === 'PENDING').length;
    const rewardPending = referrals.filter((r) => r.status === 'REWARD_PENDING').length;
    const fulfilled = referrals.filter((r) => r.status === 'FULFILLED').length;
    const totalCreditedUsd = referrals
      .filter((r) => r.status === 'FULFILLED')
      .reduce((sum, r) => sum + Number(r.rewardAmountUsd), 0);

    sendSuccess(res, {
      stats: {
        total,
        pending,
        rewardPending,
        fulfilled,
        totalCreditedUsd,
      },
      referrals: referrals.map((r) => ({
        id: r.id,
        status: r.status,
        rewardAmountUsd: Number(r.rewardAmountUsd),
        referrer: r.referrer,
        referredUser: r.referredUser,
        deploymentId: r.deploymentId,
        fulfilledAt: r.fulfilledAt,
        createdAt: r.createdAt,
      })),
    });
  })
);

/**
 * GET /api/admin/vps-pool
 * List all VPS pool entries
 */
router.get(
  '/vps-pool',
  asyncHandler(async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    const entries = await prisma.vpsPool.findMany({
      orderBy: { createdAt: 'desc' },
    });
    sendSuccess(res, { entries });
  })
);

const vpsPoolSchema = z.object({
  ovhServiceName: z.string().min(1).max(200),
});

/**
 * POST /api/admin/vps-pool
 * Add a VPS to the pool
 */
router.post(
  '/vps-pool',
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { ovhServiceName } = vpsPoolSchema.parse(req.body);
    const entry = await prisma.vpsPool.create({ data: { ovhServiceName } });
    sendSuccess(res, { entry });
  })
);

/**
 * DELETE /api/admin/vps-pool/:id
 * Remove a VPS from the pool
 */
router.delete(
  '/vps-pool/:id',
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { id } = req.params as { id: string };
    await prisma.vpsPool.delete({ where: { id } });
    sendSuccess(res, { deleted: true });
  })
);

/**
 * GET /api/admin/wallets
 * Get all user wallet addresses (EVM_WALLET and POLYMARKET_WALLET)
 */
router.get(
  '/wallets',
  asyncHandler(async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    const secrets = await prisma.secret.findMany({
      where: {
        type: { in: ['EVM_WALLET', 'POLYMARKET_WALLET'] },
        deletedAt: null,
        userId: { not: null },
      },
      include: {
        user: { select: { email: true } },
        walletMetadata: { select: { smartAccountAddress: true } },
        polymarketWalletMetadata: { select: { safeAddress: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const wallets = secrets
      .map((s) => ({
        secretId: s.id,
        type: s.type,
        email: s.user?.email ?? null,
        address:
          s.walletMetadata?.smartAccountAddress ?? s.polymarketWalletMetadata?.safeAddress ?? null,
        memo: s.memo,
        createdAt: s.createdAt,
      }))
      .filter((w) => w.address !== null);

    sendSuccess(res, { wallets });
  })
);

/**
 * GET /api/admin/active-agents
 * Get all VPS deployments for users with active agent subscriptions
 */
router.get(
  '/active-agents',
  asyncHandler(async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    const deployments = await prisma.openClawDeployment.findMany({
      where: {
        status: { notIn: ['DESTROYED', 'DESTROYING'] },
        canceledAt: null,
      },
      include: {
        user: { select: { email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    sendSuccess(res, {
      agents: deployments.map((d) => ({
        id: d.id,
        email: d.user.email,
        hostname: d.hostname,
        ipAddress: d.ipAddress,
        ovhServiceName: d.ovhServiceName,
        status: d.status,
        provisionStage: d.provisionStage,
        readyAt: d.readyAt,
        creditBalanceUsd: Number(d.creditBalanceUsd),
        currentPeriodEnd: d.currentPeriodEnd,
        createdAt: d.createdAt,
      })),
    });
  })
);

export default router;
