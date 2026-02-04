import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../types';
import { apiKeyAuthMiddleware } from '../middleware/apiKeyAuth';
import { asyncHandler } from '../middleware/errorHandler';
import { sendSuccess, errors } from '../../utils/response';
import * as rawSigner from '../../skills/rawSigner.service';
import { auditService } from '../../audit';

const router = Router();

// All raw signer skill routes require API key auth
router.use(apiKeyAuthMiddleware);

// ============================================================
// POST /api/skills/raw-signer/sign
// ============================================================

const signSchema = z.object({
  message: z.string().regex(/^0x[a-fA-F0-9]*$/, 'Message must be hex-encoded (0x...)'),
  curve: z.enum(['ethereum', 'solana']),
});

router.post(
  '/sign',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const body = signSchema.parse(req.body);

    if (!req.secret) {
      errors.unauthorized(res, 'No secret associated with API key');
      return;
    }

    const start = Date.now();
    const result = await rawSigner.sign({
      secretId: req.secret.id,
      apiKeyId: req.apiKey?.id,
      message: body.message,
      curve: body.curve,
    });

    auditService.log({
      secretId: req.secret.id,
      apiKeyId: req.apiKey?.id,
      action: 'skill.raw_sign',
      inputData: {
        curve: body.curve,
        messageLength: body.message.length,
        messagePreview: body.message.slice(0, 66) + (body.message.length > 66 ? '...' : ''),
      },
      outputData: result,
      status:
        result.status === 'denied'
          ? 'FAILED'
          : result.status === 'pending_approval'
            ? 'PENDING'
            : 'SUCCESS',
      errorMessage: result.status === 'denied' ? result.reason : undefined,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      durationMs: Date.now() - start,
    });

    const statusCode = result.status === 'executed' ? 200 : result.status === 'denied' ? 403 : 202;
    sendSuccess(res, result, statusCode);
  })
);

// ============================================================
// GET /api/skills/raw-signer/addresses
// ============================================================

router.get(
  '/addresses',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.secret) {
      errors.unauthorized(res, 'No secret associated with API key');
      return;
    }

    const result = await rawSigner.getAddresses(req.secret.id);
    sendSuccess(res, result);
  })
);

export default router;
