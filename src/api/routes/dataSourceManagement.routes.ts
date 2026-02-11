import { Router } from 'express';
import { z } from 'zod';
import { sessionAuthMiddleware, requireSecretOwnership } from '../middleware/sessionAuth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { AuthenticatedRequest } from '../../types/index.js';
import { sendSuccess } from '../../utils/response.js';
import { errors } from '../../utils/response.js';
import { getAllDataSources } from '../../dataSources/registry.js';
import * as creditService from '../../dataSources/credit.service.js';
import * as usageService from '../../dataSources/usage.service.js';
import { chargeCustomerOffSession } from '../../billing/stripe.service.js';
import prisma from '../../db/client.js';

const router = Router({ mergeParams: true });

// All routes require session auth + secret ownership
router.use(sessionAuthMiddleware);
router.use(requireSecretOwnership);

/**
 * GET /api/secrets/:secretId/data-sources
 * List available data sources with current month usage stats.
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user!.id;

    const dataSources = getAllDataSources();
    const usageSummary = await usageService.getUsageSummary(userId);

    const usageMap = new Map(usageSummary.map((u) => [u.dataSource, u]));

    const result = dataSources.map((ds) => {
      const usage = usageMap.get(ds.id);
      return {
        ...ds,
        currentMonthUsage: usage
          ? { requestCount: usage.requestCount, totalCostUsd: usage.totalCostUsd }
          : { requestCount: 0, totalCostUsd: 0 },
      };
    });

    sendSuccess(res, result);
  })
);

/**
 * GET /api/secrets/:secretId/data-sources/credits
 * Get credit balance and recent purchases.
 */
router.get(
  '/credits',
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user!.id;

    const [balance, purchases] = await Promise.all([
      creditService.getBalance(userId),
      creditService.getCreditPurchases(userId),
    ]);

    sendSuccess(res, {
      balance: balance.toNumber(),
      purchases: purchases.map((p) => ({
        id: p.id,
        amountUsd: p.amountUsd.toNumber(),
        createdAt: p.createdAt,
      })),
    });
  })
);

const addCreditsSchema = z.object({
  amountUsd: z.number().min(5).max(500),
});

/**
 * POST /api/secrets/:secretId/data-sources/credits
 * Add credits via Stripe off-session charge.
 */
router.post(
  '/credits',
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user!.id;

    const { amountUsd } = addCreditsSchema.parse(req.body);
    const amountCents = Math.round(amountUsd * 100);

    const chargeResult = await chargeCustomerOffSession(
      userId,
      amountCents,
      `Data source credits: $${amountUsd.toFixed(2)}`,
      { type: 'data_source_credits' }
    );

    if (!chargeResult.success) {
      if (chargeResult.requiresAction) {
        sendSuccess(res, {
          requiresAction: true,
          clientSecret: chargeResult.clientSecret,
        });
        return;
      }
      errors.internal(res, 'Payment failed');
      return;
    }

    const newBalance = await creditService.addCredits(
      userId,
      amountUsd,
      chargeResult.paymentIntentId!
    );

    sendSuccess(res, {
      balance: newBalance.toNumber(),
      charged: amountUsd,
    });
  })
);

/**
 * GET /api/secrets/:secretId/data-sources/usage
 * Usage breakdown by source and month.
 */
router.get(
  '/usage',
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user!.id;

    // Verify the secret belongs to this user and is DATA_SOURCES type
    const secretId = (req.params as Record<string, string>).secretId;
    const secret = await prisma.secret.findFirst({
      where: { id: secretId, userId, type: 'DATA_SOURCES', deletedAt: null },
    });

    if (!secret) {
      errors.notFound(res, 'Data source secret');
      return;
    }

    const history = await usageService.getUsageHistory(userId);

    sendSuccess(res, { history });
  })
);

export default router;
