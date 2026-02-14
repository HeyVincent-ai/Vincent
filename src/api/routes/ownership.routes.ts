import { Router, Response } from 'express';
import { z } from 'zod';
import { sessionAuthMiddleware, requireSecretOwnership } from '../middleware/sessionAuth.js';
import { sendSuccess } from '../../utils/response.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { AuthenticatedRequest } from '../../types/index.js';
import * as ownershipService from '../../services/ownership.service.js';
import { log as auditLog } from '../../audit/audit.service.js';

const router = Router({ mergeParams: true });

// ============================================================
// Validation Schemas
// ============================================================

const challengeSchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
});

const verifySchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
  signature: z.string().regex(/^0x(?:[a-fA-F0-9]{128}|[a-fA-F0-9]{130})$/, 'Invalid signature'),
});

// ============================================================
// Routes
// ============================================================

/**
 * POST /api/secrets/:secretId/take-ownership/challenge
 *
 * Request a challenge message for the user to sign.
 * This is the first step of the ownership transfer flow.
 */
router.post(
  '/challenge',
  sessionAuthMiddleware,
  requireSecretOwnership,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { secretId } = req.params as { secretId: string };
    const parseResult = challengeSchema.safeParse(req.body);

    if (!parseResult.success) {
      throw new AppError('VALIDATION_ERROR', parseResult.error.issues[0].message, 400);
    }

    const { address } = parseResult.data;

    const result = await ownershipService.requestOwnershipChallenge(secretId, address);

    auditLog({
      secretId,
      userId: req.user!.id,
      action: 'ownership.challenge_requested',
      inputData: { address },
      status: 'SUCCESS',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    sendSuccess(res, {
      challenge: result.challenge,
      expiresAt: result.expiresAt.toISOString(),
      chainsToTransfer: result.chainsToTransfer,
    });
  })
);

/**
 * POST /api/secrets/:secretId/take-ownership/verify
 *
 * Verify the signed challenge and execute the ownership transfer.
 * This is the second step of the ownership transfer flow.
 */
router.post(
  '/verify',
  sessionAuthMiddleware,
  requireSecretOwnership,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { secretId } = req.params as { secretId: string };
    const parseResult = verifySchema.safeParse(req.body);

    if (!parseResult.success) {
      throw new AppError('VALIDATION_ERROR', parseResult.error.issues[0].message, 400);
    }

    const { address, signature } = parseResult.data;
    const startTime = Date.now();

    try {
      const result = await ownershipService.verifyAndTransferOwnership(
        secretId,
        address,
        signature
      );

      auditLog({
        secretId,
        userId: req.user!.id,
        action: 'ownership.transferred',
        inputData: { newOwner: address },
        outputData: result,
        status: 'SUCCESS',
        durationMs: Date.now() - startTime,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      sendSuccess(res, {
        message: 'Ownership transferred successfully',
        newOwner: address,
        txHashes: result.txHashes,
      });
    } catch (error) {
      auditLog({
        secretId,
        userId: req.user!.id,
        action: 'ownership.transfer_failed',
        inputData: { newOwner: address },
        status: 'FAILED',
        errorMessage: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      throw error;
    }
  })
);

/**
 * GET /api/secrets/:secretId/take-ownership/status
 *
 * Get the ownership status of a wallet.
 * Returns whether ownership has been transferred, to which address,
 * and which chains have been used.
 */
router.get(
  '/status',
  sessionAuthMiddleware,
  requireSecretOwnership,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { secretId } = req.params as { secretId: string };

    const status = await ownershipService.getOwnershipStatus(secretId);

    sendSuccess(res, status);
  })
);

export default router;
