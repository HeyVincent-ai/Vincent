import { Router, Response } from 'express';
import { createHash } from 'crypto';
import { AuditLogStatus } from '@prisma/client';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../middleware/errorHandler.js';
import { AuthenticatedRequest } from '../../types/index.js';
import { readOnlyAuthMiddleware, requireReadOnlySecretAccess } from '../middleware/readOnlyAuth.js';
import { sendError, sendSuccess, errors } from '../../utils/response.js';
import { env } from '../../utils/env.js';
import prisma from '../../db/client.js';
import * as secretService from '../../services/secret.service.js';
import * as apiKeyService from '../../services/apiKey.service.js';
import { auditService } from '../../audit/index.js';
import * as ownershipService from '../../services/ownership.service.js';
import * as openclawService from '../../services/openclaw.service.js';
import * as stripeService from '../../billing/stripe.service.js';
import * as gasAggregation from '../../billing/gasAggregation.service.js';
import * as evmWallet from '../../skills/evmWallet.service.js';
import { calculateTrialStatus } from '../../skills/gas.service.js';
import { getAllDataSources } from '../../dataSources/registry.js';
import * as creditService from '../../dataSources/credit.service.js';
import * as usageService from '../../dataSources/usage.service.js';

const router = Router();
const { toPublicData } = openclawService;
const RAW_SCHEMA_VERSION = '2026-02-21';

router.use(readOnlyAuthMiddleware);

// Audit all raw access (read-only)
router.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const secretId =
      (req.params as Record<string, string>).secretId || (req.params as Record<string, string>).id;
    auditService.log({
      secretId: secretId || undefined,
      userId: req.readOnlyUserId,
      action: 'raw.read',
      inputData: {
        path: req.path,
        method: req.method,
        query: req.query,
        tokenId: req.readOnlyTokenId,
      },
      outputData: {
        statusCode: res.statusCode,
        contentLength: res.getHeader('content-length'),
      },
      status: res.statusCode < 400 ? 'SUCCESS' : 'FAILED',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      durationMs: Date.now() - start,
    });
  });
  next();
});

const rawLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  keyGenerator: (req) => {
    const authReq = req as AuthenticatedRequest;
    return authReq.readOnlyTokenId || req.ip;
  },
  message: {
    success: false,
    error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests' },
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
});

router.use(rawLimiter);

// Enforce GET-only for all raw endpoints
router.use((req, res, next) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    sendError(res, 'METHOD_NOT_ALLOWED', 'Raw endpoints are read-only', 405);
    return;
  }
  next();
});

function hashPayload(payload: unknown): string {
  const json = JSON.stringify(payload ?? null);
  return createHash('sha256').update(json).digest('hex');
}

function buildRawMeta(req: AuthenticatedRequest, payload: unknown) {
  const generatedAt = new Date().toISOString();
  const sourceRoute = req.originalUrl;
  const requestId = req.traceId;
  const etag = hashPayload(payload);

  return {
    schema_version: RAW_SCHEMA_VERSION,
    generated_at: generatedAt,
    source_route: sourceRoute,
    request_id: requestId,
    etag,
  };
}

function applyRawHeaders(res: Response, meta: ReturnType<typeof buildRawMeta>) {
  res.setHeader('ETag', `"${meta.etag}"`);
  res.setHeader('X-Raw-Generated-At', meta.generated_at);
  res.setHeader('X-Raw-Schema-Version', meta.schema_version);
  res.setHeader('X-Raw-Source-Route', meta.source_route);
  if (meta.request_id) {
    res.setHeader('X-Raw-Request-Id', meta.request_id);
  }
}

function wrapPayload(payload: unknown): Record<string, unknown> {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }
  return { items: payload };
}

function sendRawSuccess(
  res: Response,
  req: AuthenticatedRequest,
  payload: unknown,
  statusCode = 200,
  pagination?: unknown
) {
  const meta = buildRawMeta(req, payload);
  applyRawHeaders(res, meta);
  const wrapped = wrapPayload(payload);
  sendSuccess(res, { ...wrapped, meta }, statusCode, pagination as any);
}

function getAllowedSecretIds(req: AuthenticatedRequest): string[] {
  return req.readOnlySecretIds ?? [];
}

function requireUserId(req: AuthenticatedRequest, res: Response): string | null {
  if (!req.readOnlyUserId) {
    errors.unauthorized(res, 'Missing read-only user context');
    return null;
  }
  return req.readOnlyUserId;
}

/**
 * GET /api/raw
 * Basic read-only context (for health / introspection)
 */
router.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    sendRawSuccess(res, req, {
      userId: req.readOnlyUserId,
      secretIds: getAllowedSecretIds(req),
    });
  })
);

/**
 * GET /api/raw/dashboard
 * Read-only dashboard view: list of secrets scoped to the token.
 */
router.get(
  '/dashboard',
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const secrets = await secretService.getSecretsByUserId(userId);
    const allowed = new Set(getAllowedSecretIds(req));
    const filtered = secrets.filter((secret) => allowed.has(secret.id));

    sendRawSuccess(res, req, { secrets: filtered });
  })
);

/**
 * GET /api/raw/secrets
 * Alias for dashboard secrets list.
 */
router.get(
  '/secrets',
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const secrets = await secretService.getSecretsByUserId(userId);
    const allowed = new Set(getAllowedSecretIds(req));
    const filtered = secrets.filter((secret) => allowed.has(secret.id));

    sendRawSuccess(res, req, { secrets: filtered });
  })
);

/**
 * GET /api/raw/secrets/:secretId
 * Read-only secret detail.
 */
router.get(
  '/secrets/:secretId',
  requireReadOnlySecretAccess,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { secretId } = req.params as Record<string, string>;
    const secret = await secretService.getSecretById(secretId);

    if (!secret) {
      errors.notFound(res, 'Secret');
      return;
    }

    sendRawSuccess(res, req, { secret });
  })
);

/**
 * GET /api/raw/secrets/:secretId/subscription-status
 */
router.get(
  '/secrets/:secretId/subscription-status',
  requireReadOnlySecretAccess,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { secretId } = req.params as Record<string, string>;
    const userId = requireUserId(req, res);
    if (!userId) return;

    const secret = await prisma.secret.findFirst({
      where: { id: secretId, userId },
      select: { createdAt: true, userId: true },
    });

    if (!secret) {
      errors.notFound(res, 'Secret');
      return;
    }

    const trialStatus = calculateTrialStatus(secret.createdAt);

    const subscription = await prisma.subscription.findFirst({
      where: {
        userId: secret.userId ?? userId,
        status: 'ACTIVE',
        currentPeriodEnd: { gte: new Date() },
      },
      select: {
        status: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
      },
    });

    const hasMainnetAccess = trialStatus.inTrial || !!subscription;

    sendRawSuccess(res, req, {
      trial: {
        inTrial: trialStatus.inTrial,
        daysRemaining: trialStatus.trialDaysRemaining,
        endsAt: trialStatus.trialEndsAt.toISOString(),
      },
      subscription: subscription
        ? {
            status: subscription.status,
            currentPeriodStart: subscription.currentPeriodStart?.toISOString(),
            currentPeriodEnd: subscription.currentPeriodEnd?.toISOString(),
          }
        : null,
      hasMainnetAccess,
    });
  })
);

/**
 * GET /api/raw/secrets/:secretId/policies
 */
router.get(
  '/secrets/:secretId/policies',
  requireReadOnlySecretAccess,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { secretId } = req.params as Record<string, string>;
    const policies = await prisma.policy.findMany({
      where: { secretId },
      orderBy: { createdAt: 'desc' },
    });
    sendRawSuccess(res, req, { policies });
  })
);

/**
 * GET /api/raw/secrets/:secretId/api-keys
 */
router.get(
  '/secrets/:secretId/api-keys',
  requireReadOnlySecretAccess,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { secretId } = req.params as Record<string, string>;
    const apiKeys = await apiKeyService.listApiKeys(secretId);
    sendRawSuccess(res, req, { apiKeys });
  })
);

/**
 * GET /api/raw/secrets/:secretId/audit-logs
 */
router.get(
  '/secrets/:secretId/audit-logs',
  requireReadOnlySecretAccess,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { secretId } = req.params as Record<string, string>;
    const { action, status, startDate, endDate, page, limit } = req.query as Record<
      string,
      string | undefined
    >;

    const result = await auditService.query({
      secretId,
      action: action || undefined,
      status:
        status && Object.values(AuditLogStatus).includes(status as AuditLogStatus)
          ? (status as AuditLogStatus)
          : undefined,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });

    sendRawSuccess(res, req, { logs: result.logs }, 200, result.pagination);
  })
);

/**
 * GET /api/raw/secrets/:secretId/audit-logs/actions
 */
router.get(
  '/secrets/:secretId/audit-logs/actions',
  requireReadOnlySecretAccess,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { secretId } = req.params as Record<string, string>;
    const actions = await auditService.getActionTypes(secretId);
    sendRawSuccess(res, req, { actions });
  })
);

/**
 * GET /api/raw/secrets/:secretId/audit-logs/export
 */
router.get(
  '/secrets/:secretId/audit-logs/export',
  requireReadOnlySecretAccess,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { secretId } = req.params as Record<string, string>;
    const { action, status, startDate, endDate, format } = req.query as Record<
      string,
      string | undefined
    >;

    const logs = await auditService.exportLogs({
      secretId,
      action: action || undefined,
      status:
        status && Object.values(AuditLogStatus).includes(status as AuditLogStatus)
          ? (status as AuditLogStatus)
          : undefined,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });

    if (format === 'csv') {
      const header = 'id,action,status,errorMessage,ipAddress,userAgent,durationMs,createdAt\n';
      const rows = logs
        .map((l) =>
          [
            l.id,
            l.action,
            l.status,
            l.errorMessage ?? '',
            l.ipAddress ?? '',
            l.userAgent ?? '',
            l.durationMs ?? '',
            l.createdAt.toISOString(),
          ]
            .map((v) => `"${String(v).replace(/"/g, '""')}"`)
            .join(',')
        )
        .join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=audit-logs-${secretId}.csv`);
      const meta = buildRawMeta(req, header + rows);
      applyRawHeaders(res, meta);
      res.send(header + rows);
      return;
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=audit-logs-${secretId}.json`);
    sendRawSuccess(res, req, { logs });
  })
);

/**
 * GET /api/raw/secrets/:secretId/audit-logs/:logId
 */
router.get(
  '/secrets/:secretId/audit-logs/:logId',
  requireReadOnlySecretAccess,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { secretId, logId } = req.params as Record<string, string>;
    const log = await auditService.getById(logId, secretId);

    if (!log) {
      errors.notFound(res, 'Audit log');
      return;
    }

    sendRawSuccess(res, req, { log });
  })
);

/**
 * GET /api/raw/secrets/:secretId/balances
 */
router.get(
  '/secrets/:secretId/balances',
  requireReadOnlySecretAccess,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { secretId } = req.params as Record<string, string>;
    const chainIdsParam = req.query.chainIds;
    const chainIds =
      typeof chainIdsParam === 'string' && chainIdsParam
        ? chainIdsParam
            .split(',')
            .map((c) => parseInt(c.trim(), 10))
            .filter((c) => !isNaN(c))
        : undefined;

    const result = await evmWallet.getPortfolioBalances(secretId, chainIds);
    sendRawSuccess(res, req, result);
  })
);

/**
 * GET /api/raw/secrets/:secretId/take-ownership/status
 */
router.get(
  '/secrets/:secretId/take-ownership/status',
  requireReadOnlySecretAccess,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { secretId } = req.params as Record<string, string>;
    const status = await ownershipService.getOwnershipStatus(secretId);
    sendRawSuccess(res, req, status);
  })
);

async function ensureDataSourcesSecret(secretId: string, userId: string) {
  const secret = await prisma.secret.findFirst({
    where: { id: secretId, userId, type: 'DATA_SOURCES', deletedAt: null },
  });
  return secret;
}

/**
 * GET /api/raw/secrets/:secretId/data-sources
 */
router.get(
  '/secrets/:secretId/data-sources',
  requireReadOnlySecretAccess,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    const { secretId } = req.params as Record<string, string>;

    const secret = await ensureDataSourcesSecret(secretId, userId);
    if (!secret) {
      errors.notFound(res, 'Data source secret');
      return;
    }

    const dataSources = getAllDataSources();
    const usageSummary = await usageService.getUsageSummary(userId);
    const usageMap = new Map(usageSummary.map((u) => [u.dataSource, u]));

    const result = dataSources.map((ds) => {
      const usage = usageMap.get(ds.id);
      return {
        ...ds,
        currentMonthUsage: usage
          ? { requestCount: usage.requestCount, totalCostUsd: usage.totalCostUsd }
          : { requestCount: 0, totalCostUsd: 0 },
      };
    });

    sendRawSuccess(res, req, result);
  })
);

/**
 * GET /api/raw/secrets/:secretId/data-sources/credits
 */
router.get(
  '/secrets/:secretId/data-sources/credits',
  requireReadOnlySecretAccess,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    const { secretId } = req.params as Record<string, string>;

    const secret = await ensureDataSourcesSecret(secretId, userId);
    if (!secret) {
      errors.notFound(res, 'Data source secret');
      return;
    }

    const [balance, purchases] = await Promise.all([
      creditService.getBalance(userId),
      creditService.getCreditPurchases(userId),
    ]);

    sendRawSuccess(res, req, {
      balance: balance.toNumber(),
      purchases: purchases.map((p) => ({
        id: p.id,
        amountUsd: p.amountUsd.toNumber(),
        createdAt: p.createdAt,
      })),
    });
  })
);

/**
 * GET /api/raw/secrets/:secretId/data-sources/usage
 */
router.get(
  '/secrets/:secretId/data-sources/usage',
  requireReadOnlySecretAccess,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    const { secretId } = req.params as Record<string, string>;

    const secret = await ensureDataSourcesSecret(secretId, userId);
    if (!secret) {
      errors.notFound(res, 'Data source secret');
      return;
    }

    const history = await usageService.getUsageHistory(userId);
    sendRawSuccess(res, req, { history });
  })
);

/**
 * GET /api/raw/account/profile
 */
router.get(
  '/account/profile',
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      errors.notFound(res, 'User');
      return;
    }

    sendRawSuccess(res, req, {
      user: {
        id: user.id,
        email: user.email,
        telegramUsername: user.telegramUsername,
        telegramLinked: !!user.telegramChatId,
        createdAt: user.createdAt,
      },
    });
  })
);

/**
 * GET /api/raw/billing/subscription
 */
router.get(
  '/billing/subscription',
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const subscription = await stripeService.getSubscription(userId);
    sendRawSuccess(res, req, {
      hasSubscription: !!subscription,
      subscription: subscription
        ? {
            id: subscription.id,
            status: subscription.status,
            currentPeriodStart: subscription.currentPeriodStart,
            currentPeriodEnd: subscription.currentPeriodEnd,
            canceledAt: subscription.canceledAt,
          }
        : null,
    });
  })
);

/**
 * GET /api/raw/billing/usage
 */
router.get(
  '/billing/usage',
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const usage = await gasAggregation.getCurrentMonthUsage(userId);
    sendRawSuccess(res, req, usage);
  })
);

/**
 * GET /api/raw/billing/usage/history
 */
router.get(
  '/billing/usage/history',
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const history = await gasAggregation.getGasUsageHistory(userId);
    sendRawSuccess(res, {
      history: history.map((h) => ({
        id: h.id,
        month: h.month,
        totalCostUsd: h.totalCostUsd.toNumber(),
        billed: h.billed,
        stripeInvoiceId: h.stripeInvoiceId,
      })),
    });
  })
);

/**
 * GET /api/raw/billing/invoices
 */
router.get(
  '/billing/invoices',
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.stripeCustomerId) {
      sendRawSuccess(res, req, { invoices: [] });
      return;
    }

    const summaries = await gasAggregation.getGasUsageHistory(userId);
    const invoices = summaries
      .filter((s) => s.billed)
      .map((s) => ({
        month: s.month,
        totalCostUsd: s.totalCostUsd.toNumber(),
        stripeInvoiceId: s.stripeInvoiceId,
      }));

    sendRawSuccess(res, req, { invoices });
  })
);

/**
 * GET /api/raw/openclaw/deployments
 */
router.get(
  '/openclaw/deployments',
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const deployments = await openclawService.listDeployments(userId);
    sendRawSuccess(res, req, { deployments: deployments.map(toPublicData) });
  })
);

/**
 * GET /api/raw/openclaw/deployments/:id
 */
router.get(
  '/openclaw/deployments/:id',
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const deployment = await openclawService.getDeployment(req.params.id as string, userId);
    if (!deployment) {
      errors.notFound(res, 'Deployment');
      return;
    }
    sendRawSuccess(res, req, { deployment: toPublicData(deployment) });
  })
);

/**
 * GET /api/raw/openclaw/deployments/:id/usage
 */
router.get(
  '/openclaw/deployments/:id/usage',
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const usage = await openclawService.getUsage(req.params.id as string, userId);
    sendRawSuccess(res, req, usage);
  })
);

/**
 * GET /api/raw/openclaw/deployments/:id/health
 */
router.get(
  '/openclaw/deployments/:id/health',
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const deployment = await openclawService.getDeployment(req.params.id as string, userId);
    if (!deployment) {
      errors.notFound(res, 'Deployment');
      return;
    }

    const health = await openclawService.checkGatewayHealthOnce(
      deployment.hostname || undefined,
      deployment.ipAddress || undefined
    );

    sendRawSuccess(res, req, {
      health: {
        ...health,
        checkedAt: new Date().toISOString(),
      },
    });
  })
);

export default router;
