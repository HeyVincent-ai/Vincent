import { Router, Response } from 'express';
import { z } from 'zod';
import { type Address, type Hex } from 'viem';
import { sessionAuthMiddleware, requireSecretOwnership } from '../middleware/sessionAuth.js';
import { sendSuccess } from '../../utils/response.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { AuthenticatedRequest } from '../../types/index.js';
import * as zerodev from '../../skills/zerodev.service.js';
import { log as auditLog } from '../../audit/audit.service.js';
import prisma from '../../db/client.js';

const router = Router({ mergeParams: true });

// ============================================================
// Validation Schemas
// ============================================================

const executeSchema = z.object({
  to: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
  data: z.string().regex(/^0x[a-fA-F0-9]*$/, 'Invalid hex data'),
  value: z.string().regex(/^0x[a-fA-F0-9]+$/, 'Invalid hex value').default('0x0'),
  chainId: z.number().int().positive(),
});

// ============================================================
// Routes
// ============================================================

/**
 * POST /api/secrets/:secretId/walletconnect/execute
 *
 * Execute a transaction via the guardian validator on behalf of
 * a self-custodied smart wallet. Only available after ownership transfer.
 */
router.post(
  '/execute',
  sessionAuthMiddleware,
  requireSecretOwnership,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { secretId } = req.params as { secretId: string };
    const parseResult = executeSchema.safeParse(req.body);

    if (!parseResult.success) {
      throw new AppError('VALIDATION_ERROR', parseResult.error.issues[0].message, 400);
    }

    const { to, data, value, chainId } = parseResult.data;

    // Load the secret and wallet metadata
    const secret = await prisma.secret.findUnique({
      where: { id: secretId },
      include: { walletMetadata: true },
    });

    if (!secret || !secret.value || !secret.walletMetadata) {
      throw new AppError('NOT_FOUND', 'Wallet not found', 404);
    }

    if (!secret.walletMetadata.canTakeOwnership) {
      throw new AppError('NOT_ELIGIBLE', 'This wallet is not eligible for WalletConnect', 400);
    }

    if (!secret.walletMetadata.ownershipTransferred) {
      throw new AppError(
        'OWNERSHIP_NOT_TRANSFERRED',
        'Ownership must be transferred before using WalletConnect',
        400
      );
    }

    const startTime = Date.now();

    try {
      const result = await zerodev.executeSendTransaction({
        privateKey: secret.value as Hex,
        chainId,
        to: to as Address,
        data: data as Hex,
        value: BigInt(value),
        useGuardian: true,
        smartAccountAddress: secret.walletMetadata.smartAccountAddress as Address,
      });

      auditLog({
        secretId,
        userId: req.user!.id,
        action: 'walletconnect.execute',
        inputData: { to, data: data.slice(0, 10), value, chainId },
        outputData: { txHash: result.txHash },
        status: 'SUCCESS',
        durationMs: Date.now() - startTime,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      sendSuccess(res, { txHash: result.txHash });
    } catch (error) {
      auditLog({
        secretId,
        userId: req.user!.id,
        action: 'walletconnect.execute',
        inputData: { to, data: data.slice(0, 10), value, chainId },
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

export default router;
