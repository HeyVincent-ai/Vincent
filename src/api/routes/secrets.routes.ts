import { Router, Response } from 'express';
import { z } from 'zod';
import { SecretType } from '@prisma/client';
import { asyncHandler } from '../middleware/errorHandler';
import { apiKeyAuthMiddleware } from '../middleware/apiKeyAuth';
import { AuthenticatedRequest } from '../../types';
import { sendSuccess, errors } from '../../utils/response';
import * as secretService from '../../services/secret.service';
import * as apiKeyService from '../../services/apiKey.service';

const router = Router();

// Helper to safely extract a string from Express params/query (which can be string | string[])
function str(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0];
  return undefined;
}

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
 * Create a new secret (agent endpoint)
 *
 * For EVM_WALLET: generates EOA private key and smart account
 * Returns: API key for agent access + claim URL for owner
 */
router.post(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const body = createSecretSchema.parse(req.body);

    // Create the secret
    const { secret, claimUrl } = await secretService.createSecret({
      type: body.type,
      memo: body.memo,
    });

    // Create an initial API key for the agent
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
          key: plainKey, // Only returned once!
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
 * Get secret by ID (requires ownership or API key)
 */
router.get(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const id = str(req.params.id)!;

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
 * Requires: User authentication (to be added in Phase 3)
 */
router.post(
  '/:id/claim',
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const id = str(req.params.id)!;
    const body = claimSecretSchema.parse(req.body);

    // TODO: In Phase 3, get userId from authenticated user session
    const userId = (req.body as { userId?: string }).userId;

    if (!userId) {
      errors.badRequest(res, 'userId is required (will come from auth in Phase 3)');
      return;
    }

    const secret = await secretService.claimSecret({
      secretId: id,
      claimToken: body.claimToken,
      userId,
    });

    sendSuccess(res, { secret });
  })
);

/**
 * PUT /api/secrets/:id/value
 * Set secret value (for user-provided secrets)
 * Requires: User authentication (to be added in Phase 3)
 */
router.put(
  '/:id/value',
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const id = str(req.params.id)!;
    const body = setSecretValueSchema.parse(req.body);

    // TODO: In Phase 3, get userId from authenticated user session
    const userId = (req.body as { userId?: string }).userId;

    if (!userId) {
      errors.badRequest(res, 'userId is required (will come from auth in Phase 3)');
      return;
    }

    const secret = await secretService.setSecretValue({
      secretId: id,
      userId,
      value: body.value,
    });

    sendSuccess(res, { secret });
  })
);

/**
 * DELETE /api/secrets/:id
 * Soft delete a secret
 * Requires: User authentication (to be added in Phase 3)
 */
router.delete(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const id = str(req.params.id)!;
    const userId = str(req.query.userId as string | undefined);

    if (!userId) {
      errors.badRequest(res, 'userId query param is required (will come from auth in Phase 3)');
      return;
    }

    await secretService.deleteSecret(id, userId);

    sendSuccess(res, { message: 'Secret deleted successfully' });
  })
);

export default router;
