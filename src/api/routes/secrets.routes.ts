import { Router, Response } from 'express';
import { z } from 'zod';
import { SecretType } from '@prisma/client';
import { asyncHandler } from '../middleware/errorHandler';
import { apiKeyAuthMiddleware } from '../middleware/apiKeyAuth';
import { sessionAuthMiddleware, requireSecretOwnership } from '../middleware/sessionAuth';
import { AuthenticatedRequest } from '../../types';
import { sendSuccess, errors } from '../../utils/response';
import * as secretService from '../../services/secret.service';
import * as apiKeyService from '../../services/apiKey.service';
import { auditService } from '../../audit';

const router = Router();

// Validation schemas
const createSecretSchema = z.object({
  type: z.nativeEnum(SecretType),
  memo: z.string().max(500).optional(),
});

const claimSecretSchema = z.object({
  claimToken: z.string().min(1),
});

const setSecretValueSchema = z.object({
  value: z.string().min(1),
});

/**
 * POST /api/secrets
 * Create a new secret (agent endpoint - no auth required)
 *
 * For EVM_WALLET: generates EOA private key and smart account
 * Returns: API key for agent access + claim URL for owner
 */
router.post(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const body = createSecretSchema.parse(req.body);

    const { secret, claimUrl } = await secretService.createSecret({
      type: body.type,
      memo: body.memo,
    });

    const { apiKey, plainKey } = await apiKeyService.createApiKey({
      secretId: secret.id,
      name: 'Initial API Key',
    });

    sendSuccess(
      res,
      {
        secret,
        apiKey: {
          id: apiKey.id,
          key: plainKey,
        },
        claimUrl,
      },
      201
    );
  })
);

/**
 * GET /api/secrets/info
 * Get secret info by API key (agent endpoint)
 * Requires: API key authentication
 */
router.get(
  '/info',
  apiKeyAuthMiddleware,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    if (!req.secret) {
      errors.unauthorized(res, 'Not authenticated');
      return;
    }

    const secret = await secretService.getSecretById(req.secret.id);

    if (!secret) {
      errors.notFound(res, 'Secret');
      return;
    }

    sendSuccess(res, { secret });
  })
);

/**
 * GET /api/secrets/:id
 * Get secret by ID (requires session + ownership)
 */
router.get(
  '/:id',
  sessionAuthMiddleware,
  requireSecretOwnership,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const id = (req.params as Record<string, string>).id;

    const secret = await secretService.getSecretById(id);

    if (!secret) {
      errors.notFound(res, 'Secret');
      return;
    }

    sendSuccess(res, { secret });
  })
);

/**
 * POST /api/secrets/:id/claim
 * Claim a secret using claim token
 * Requires: User session authentication
 */
router.post(
  '/:id/claim',
  sessionAuthMiddleware,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const id = (req.params as Record<string, string>).id;
    const body = claimSecretSchema.parse(req.body);

    const secret = await secretService.claimSecret({
      secretId: id,
      claimToken: body.claimToken,
      userId: req.user!.id,
    });

    auditService.log({
      secretId: id,
      userId: req.user!.id,
      action: 'secret.claim',
      inputData: { secretId: id },
      status: 'SUCCESS',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    sendSuccess(res, { secret });
  })
);

/**
 * PUT /api/secrets/:id/value
 * Set secret value (for user-provided secrets)
 * Requires: User session + ownership
 */
router.put(
  '/:id/value',
  sessionAuthMiddleware,
  requireSecretOwnership,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const id = (req.params as Record<string, string>).id;
    const body = setSecretValueSchema.parse(req.body);

    const secret = await secretService.setSecretValue({
      secretId: id,
      userId: req.user!.id,
      value: body.value,
    });

    sendSuccess(res, { secret });
  })
);

/**
 * DELETE /api/secrets/:id
 * Soft delete a secret
 * Requires: User session + ownership
 */
router.delete(
  '/:id',
  sessionAuthMiddleware,
  requireSecretOwnership,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const id = (req.params as Record<string, string>).id;

    await secretService.deleteSecret(id, req.user!.id);

    auditService.log({
      secretId: id,
      userId: req.user!.id,
      action: 'secret.delete',
      inputData: { secretId: id },
      status: 'SUCCESS',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    sendSuccess(res, { message: 'Secret deleted successfully' });
  })
);

export default router;
