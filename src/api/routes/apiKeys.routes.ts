import { Router, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler';
import { AuthenticatedRequest } from '../../types';
import { sendSuccess, errors } from '../../utils/response';
import * as apiKeyService from '../../services/apiKey.service';
import * as secretService from '../../services/secret.service';
import { auditService } from '../../audit';

const router = Router();

// Helper to safely extract a string from Express params/query (which can be string | string[])
function str(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0];
  return undefined;
}

// Validation schemas
const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
});

/**
 * POST /api/secrets/:secretId/api-keys
 * Create a new API key for a secret
 * Requires: User authentication and secret ownership (to be added in Phase 3)
 */
router.post(
  '/:secretId/api-keys',
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const secretId = str(req.params.secretId)!;
    const body = createApiKeySchema.parse(req.body);

    // TODO: In Phase 3, get userId from authenticated user session
    const userId = (req.body as { userId?: string }).userId;

    if (!userId) {
      errors.badRequest(res, 'userId is required (will come from auth in Phase 3)');
      return;
    }

    // Verify ownership
    const isOwner = await secretService.verifySecretOwnership(secretId, userId);
    if (!isOwner) {
      errors.forbidden(res, 'You do not own this secret');
      return;
    }

    const { apiKey, plainKey } = await apiKeyService.createApiKey({
      secretId,
      name: body.name,
    });

    auditService.log({
      secretId,
      userId,
      action: 'apikey.create',
      inputData: { name: body.name },
      outputData: { apiKeyId: apiKey.id },
      status: 'SUCCESS',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    sendSuccess(
      res,
      {
        apiKey,
        key: plainKey, // Only returned once!
        warning: 'Store this key securely. It will not be shown again.',
      },
      201
    );
  })
);

/**
 * GET /api/secrets/:secretId/api-keys
 * List all API keys for a secret
 * Requires: User authentication and secret ownership (to be added in Phase 3)
 */
router.get(
  '/:secretId/api-keys',
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const secretId = str(req.params.secretId)!;
    const userId = str(req.query.userId as string | undefined);

    if (!userId) {
      errors.badRequest(res, 'userId query param is required (will come from auth in Phase 3)');
      return;
    }

    // Verify ownership
    const isOwner = await secretService.verifySecretOwnership(secretId, userId);
    if (!isOwner) {
      errors.forbidden(res, 'You do not own this secret');
      return;
    }

    const apiKeys = await apiKeyService.listApiKeys(secretId);

    sendSuccess(res, { apiKeys });
  })
);

/**
 * DELETE /api/secrets/:secretId/api-keys/:keyId
 * Revoke an API key
 * Requires: User authentication and secret ownership (to be added in Phase 3)
 */
router.delete(
  '/:secretId/api-keys/:keyId',
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const secretId = str(req.params.secretId)!;
    const keyId = str(req.params.keyId)!;
    const userId = str(req.query.userId as string | undefined);

    if (!userId) {
      errors.badRequest(res, 'userId query param is required (will come from auth in Phase 3)');
      return;
    }

    const apiKey = await apiKeyService.revokeApiKey(keyId, secretId, userId);

    auditService.log({
      secretId,
      userId,
      action: 'apikey.revoke',
      inputData: { apiKeyId: keyId },
      status: 'SUCCESS',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    sendSuccess(res, {
      apiKey,
      message: 'API key revoked successfully',
    });
  })
);

/**
 * GET /api/secrets/:secretId/api-keys/:keyId
 * Get API key details
 * Requires: User authentication and secret ownership (to be added in Phase 3)
 */
router.get(
  '/:secretId/api-keys/:keyId',
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const secretId = str(req.params.secretId)!;
    const keyId = str(req.params.keyId)!;
    const userId = str(req.query.userId as string | undefined);

    if (!userId) {
      errors.badRequest(res, 'userId query param is required (will come from auth in Phase 3)');
      return;
    }

    // Verify ownership
    const isOwner = await secretService.verifySecretOwnership(secretId, userId);
    if (!isOwner) {
      errors.forbidden(res, 'You do not own this secret');
      return;
    }

    const apiKey = await apiKeyService.getApiKeyById(keyId);

    if (!apiKey || apiKey.secretId !== secretId) {
      errors.notFound(res, 'API key');
      return;
    }

    sendSuccess(res, { apiKey });
  })
);

export default router;
