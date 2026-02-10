import { Router, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler.js';
import { AuthenticatedRequest } from '../../types/index.js';
import { sendSuccess, errors } from '../../utils/response.js';
import { sessionAuthMiddleware, requireSecretOwnership } from '../middleware/sessionAuth.js';
import * as apiKeyService from '../../services/apiKey.service.js';
import { auditService } from '../../audit/index.js';

const router = Router();

// Validation schemas
const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
});

// All routes require session auth + secret ownership
router.use('/:secretId/api-keys', sessionAuthMiddleware, requireSecretOwnership);

/**
 * POST /api/secrets/:secretId/api-keys
 * Create a new API key for a secret
 */
router.post(
  '/:secretId/api-keys',
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const secretId = (req.params as Record<string, string>).secretId;
    const body = createApiKeySchema.parse(req.body);
    const userId = req.user!.id;

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
 */
router.get(
  '/:secretId/api-keys',
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const secretId = (req.params as Record<string, string>).secretId;

    const apiKeys = await apiKeyService.listApiKeys(secretId);

    sendSuccess(res, { apiKeys });
  })
);

/**
 * DELETE /api/secrets/:secretId/api-keys/:keyId
 * Revoke an API key
 */
router.delete(
  '/:secretId/api-keys/:keyId',
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const secretId = (req.params as Record<string, string>).secretId;
    const keyId = (req.params as Record<string, string>).keyId;
    const userId = req.user!.id;

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
 */
router.get(
  '/:secretId/api-keys/:keyId',
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const secretId = (req.params as Record<string, string>).secretId;
    const keyId = (req.params as Record<string, string>).keyId;

    const apiKey = await apiKeyService.getApiKeyById(keyId);

    if (!apiKey || apiKey.secretId !== secretId) {
      errors.notFound(res, 'API key');
      return;
    }

    sendSuccess(res, { apiKey });
  })
);

export default router;
