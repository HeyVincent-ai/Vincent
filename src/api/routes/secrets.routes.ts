import { Router, Response } from 'express';
import { z } from 'zod';
import { SecretType } from '@prisma/client';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../middleware/errorHandler';
import { apiKeyAuthMiddleware } from '../middleware/apiKeyAuth';
import { sessionAuthMiddleware, requireSecretOwnership } from '../middleware/sessionAuth';
import { AuthenticatedRequest } from '../../types';
import { sendSuccess, errors } from '../../utils/response';
import * as secretService from '../../services/secret.service';
import * as apiKeyService from '../../services/apiKey.service';
import * as evmWallet from '../../skills/evmWallet.service';
import { auditService } from '../../audit';

const router = Router();

// Strict rate limiter for unauthenticated secret creation (5 per IP per 15 min)
const secretCreationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    success: false,
    error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many secret creation requests. Try again later.' },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

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

const relinkSchema = z.object({
  relinkToken: z.string().min(1),
  apiKeyName: z.string().max(100).optional(),
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
  secretCreationLimiter,
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
 * POST /api/secrets/relink
 * Agent provides a re-link token to obtain a new API key for the secret.
 * No auth required (the re-link token is the auth).
 */
router.post(
  '/relink',
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const body = relinkSchema.parse(req.body);

    const secretId = secretService.consumeRelinkToken(body.relinkToken);
    if (!secretId) {
      errors.forbidden(res, 'Invalid or expired re-link token');
      return;
    }

    const secret = await secretService.getSecretById(secretId);
    if (!secret) {
      errors.notFound(res, 'Secret');
      return;
    }

    const { apiKey, plainKey } = await apiKeyService.createApiKey({
      secretId,
      name: body.apiKeyName || 'Re-linked API Key',
    });

    auditService.log({
      secretId,
      action: 'secret.relinked',
      inputData: { secretId, apiKeyName: body.apiKeyName },
      status: 'SUCCESS',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    sendSuccess(res, {
      secret,
      apiKey: { id: apiKey.id, key: plainKey },
    });
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
 * GET /api/secrets/:id/balances
 * Get portfolio balances for a wallet secret (Alchemy Portfolio API)
 * Requires: User session + ownership
 */
router.get(
  '/:id/balances',
  sessionAuthMiddleware,
  requireSecretOwnership,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const id = (req.params as Record<string, string>).id;

    const chainIdsParam = req.query.chainIds;
    const chainIds = typeof chainIdsParam === 'string' && chainIdsParam
      ? chainIdsParam.split(',').map((c) => parseInt(c.trim(), 10)).filter((c) => !isNaN(c))
      : undefined;

    const result = await evmWallet.getPortfolioBalances(id, chainIds);
    sendSuccess(res, result);
  })
);

/**
 * POST /api/secrets/:id/swap/preview
 * Preview a token swap for a wallet secret
 * Requires: User session + ownership
 */
router.post(
  '/:id/swap/preview',
  sessionAuthMiddleware,
  requireSecretOwnership,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const id = (req.params as Record<string, string>).id;

    const body = z.object({
      sellToken: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid sell token address'),
      buyToken: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid buy token address'),
      sellAmount: z.string().regex(/^\d+(\.\d+)?$/, 'Amount must be a numeric string'),
      chainId: z.number().int().positive(),
      slippageBps: z.number().int().min(0).max(10000).optional(),
    }).parse(req.body);

    const result = await evmWallet.previewSwap({
      secretId: id,
      sellToken: body.sellToken,
      buyToken: body.buyToken,
      sellAmount: body.sellAmount,
      chainId: body.chainId,
      slippageBps: body.slippageBps,
    });

    sendSuccess(res, result);
  })
);

/**
 * POST /api/secrets/:id/swap/execute
 * Execute a token swap for a wallet secret
 * Requires: User session + ownership
 */
router.post(
  '/:id/swap/execute',
  sessionAuthMiddleware,
  requireSecretOwnership,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const id = (req.params as Record<string, string>).id;

    const body = z.object({
      sellToken: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid sell token address'),
      buyToken: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid buy token address'),
      sellAmount: z.string().regex(/^\d+(\.\d+)?$/, 'Amount must be a numeric string'),
      chainId: z.number().int().positive(),
      slippageBps: z.number().int().min(0).max(10000).optional(),
    }).parse(req.body);

    const start = Date.now();
    const result = await evmWallet.executeSwap({
      secretId: id,
      sellToken: body.sellToken,
      buyToken: body.buyToken,
      sellAmount: body.sellAmount,
      chainId: body.chainId,
      slippageBps: body.slippageBps,
    });

    auditService.log({
      secretId: id,
      userId: req.user!.id,
      action: 'skill.swap_execute',
      inputData: body,
      outputData: result,
      status: result.status === 'denied' ? 'FAILED' : result.status === 'pending_approval' ? 'PENDING' : 'SUCCESS',
      errorMessage: result.status === 'denied' ? result.reason : undefined,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      durationMs: Date.now() - start,
    });

    const statusCode = result.status === 'executed' ? 200 : result.status === 'denied' ? 403 : 202;
    sendSuccess(res, result, statusCode);
  })
);

/**
 * POST /api/secrets/:id/relink-token
 * Generate a one-time re-link token that an agent can use to get a new API key.
 * Requires: User session + ownership
 */
router.post(
  '/:id/relink-token',
  sessionAuthMiddleware,
  requireSecretOwnership,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const id = (req.params as Record<string, string>).id;
    const { token, expiresAt } = secretService.generateRelinkToken(id);

    auditService.log({
      secretId: id,
      userId: req.user!.id,
      action: 'secret.relink_token_generated',
      inputData: { secretId: id },
      status: 'SUCCESS',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    sendSuccess(res, { relinkToken: token, expiresAt });
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
