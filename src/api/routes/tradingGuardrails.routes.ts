import { Router, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler.js';
import { sessionAuthMiddleware } from '../middleware/sessionAuth.js';
import { AuthenticatedRequest } from '../../types/index.js';
import { sendSuccess } from '../../utils/response.js';
import * as tradingPolicyService from '../../services/tradingPolicy.service.js';
import { TradingVenue } from '@prisma/client';
import { auditService } from '../../audit/index.js';

const router = Router();

router.use(sessionAuthMiddleware);

const policySchema = z.object({
  venue: z.enum(['alpaca']).default('alpaca'),
  enabled: z.boolean().optional(),
  allowedSymbols: z.array(z.string()).optional(),
  allowedOrderTypes: z.array(z.enum(['market', 'limit'])).optional(),
  longOnly: z.boolean().optional(),
  restrictToRth: z.boolean().optional(),
  timezone: z.string().optional(),
  maxOrderNotionalUsd: z.number().positive().nullable().optional(),
  maxPositionNotionalUsdPerSymbol: z.number().positive().nullable().optional(),
  maxDailyNotionalUsd: z.number().positive().nullable().optional(),
});

// GET /api/guardrails/trading?venue=alpaca
router.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const venue = (req.query.venue as string) || 'alpaca';
    if (venue !== 'alpaca') {
      sendSuccess(res, { policy: null });
      return;
    }
    const policy = await tradingPolicyService.getPolicy(req.user!.id, TradingVenue.ALPACA);
    sendSuccess(res, { policy });
  })
);

// PUT /api/guardrails/trading?venue=alpaca
router.put(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const body = policySchema.parse(req.body);
    const policy = await tradingPolicyService.upsertPolicy(req.user!.id, body);

    auditService.log({
      userId: req.user!.id,
      action: 'trading_policy.upsert',
      inputData: body,
      outputData: { policyId: policy.id },
      status: 'SUCCESS',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    sendSuccess(res, { policy });
  })
);

export default router;
