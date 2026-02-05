import { Router, Response } from 'express';
import { z } from 'zod';
import { PolicyType } from '@prisma/client';
import { asyncHandler } from '../middleware/errorHandler.js';
import { sessionAuthMiddleware, requireSecretOwnership } from '../middleware/sessionAuth.js';
import { AuthenticatedRequest } from '../../types/index.js';
import { sendSuccess, errors } from '../../utils/response.js';
import * as policyService from '../../services/policy.service.js';
import { auditService } from '../../audit/index.js';

const router = Router({ mergeParams: true });

// Validation schemas
const createPolicySchema = z.object({
  policyType: z.nativeEnum(PolicyType),
  policyConfig: z.unknown(),
});

const updatePolicySchema = z.object({
  policyConfig: z.unknown(),
});

/**
 * GET /api/secrets/:secretId/policies
 * List all policies for a secret
 * Requires: session + ownership
 */
router.get(
  '/',
  sessionAuthMiddleware,
  requireSecretOwnership,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { secretId } = req.params as Record<string, string>;
    const policies = await policyService.listPolicies(secretId);
    sendSuccess(res, { policies });
  })
);

/**
 * POST /api/secrets/:secretId/policies
 * Create a new policy
 * Requires: session + ownership
 */
router.post(
  '/',
  sessionAuthMiddleware,
  requireSecretOwnership,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { secretId } = req.params as Record<string, string>;
    const body = createPolicySchema.parse(req.body);

    const policy = await policyService.createPolicy({
      secretId,
      policyType: body.policyType,
      policyConfig: body.policyConfig,
    });

    auditService.log({
      secretId,
      userId: req.user?.id,
      action: 'policy.create',
      inputData: { policyType: body.policyType, policyConfig: body.policyConfig },
      outputData: { policyId: policy.id },
      status: 'SUCCESS',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    sendSuccess(res, { policy }, 201);
  })
);

/**
 * PUT /api/secrets/:secretId/policies/:policyId
 * Update a policy's config
 * Requires: session + ownership
 */
router.put(
  '/:policyId',
  sessionAuthMiddleware,
  requireSecretOwnership,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { secretId, policyId } = req.params as Record<string, string>;
    const body = updatePolicySchema.parse(req.body);

    const policy = await policyService.updatePolicy({
      policyId,
      secretId,
      policyConfig: body.policyConfig,
    });

    auditService.log({
      secretId,
      userId: req.user?.id,
      action: 'policy.update',
      inputData: { policyId, policyConfig: body.policyConfig },
      outputData: { policyId: policy.id },
      status: 'SUCCESS',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    sendSuccess(res, { policy });
  })
);

/**
 * DELETE /api/secrets/:secretId/policies/:policyId
 * Delete a policy
 * Requires: session + ownership
 */
router.delete(
  '/:policyId',
  sessionAuthMiddleware,
  requireSecretOwnership,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { secretId, policyId } = req.params as Record<string, string>;

    await policyService.deletePolicy(policyId, secretId);

    auditService.log({
      secretId,
      userId: req.user?.id,
      action: 'policy.delete',
      inputData: { policyId },
      status: 'SUCCESS',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    sendSuccess(res, { message: 'Policy deleted successfully' });
  })
);

export default router;
