import { Router, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler.js';
import { AuthenticatedRequest } from '../../types/index.js';
import { sessionAuthMiddleware } from '../middleware/sessionAuth.js';
import { sendSuccess } from '../../utils/response.js';
import * as readOnlyTokenService from '../../services/readOnlyToken.service.js';
import { auditService } from '../../audit/index.js';

const router = Router();

const mintSchema = z.object({
  apiKeys: z.array(z.string().min(1)).min(1).max(50),
});

/**
 * POST /api/read-only-tokens/mint
 * Mint a read-only token from one or more API keys.
 * No session auth required.
 */
router.post(
  '/mint',
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const body = mintSchema.parse(req.body);

    const result = await readOnlyTokenService.mintReadOnlyToken({ apiKeys: body.apiKeys });

    auditService.log({
      userId: result.userId,
      action: 'readonly_token.mint',
      inputData: { apiKeyCount: body.apiKeys.length, secretIds: result.secretIds },
      outputData: { tokenId: result.tokenId },
      status: 'SUCCESS',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    sendSuccess(
      res,
      {
        token: result.plainToken,
        tokenId: result.tokenId,
        secretIds: result.secretIds,
      },
      201
    );
  })
);

/**
 * GET /api/read-only-tokens
 * List read-only tokens for the current user.
 */
router.get(
  '/',
  sessionAuthMiddleware,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const tokens = await readOnlyTokenService.listReadOnlyTokens(req.user!.id);
    sendSuccess(res, { tokens });
  })
);

/**
 * DELETE /api/read-only-tokens/:tokenId
 * Revoke a read-only token for the current user.
 */
router.delete(
  '/:tokenId',
  sessionAuthMiddleware,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const tokenId = (req.params as Record<string, string>).tokenId;
    const revoked = await readOnlyTokenService.revokeReadOnlyToken(tokenId, req.user!.id);

    auditService.log({
      userId: req.user!.id,
      action: 'readonly_token.revoke',
      inputData: { tokenId },
      status: 'SUCCESS',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    sendSuccess(res, {
      tokenId: revoked.id,
      revokedAt: revoked.revokedAt,
    });
  })
);

export default router;
