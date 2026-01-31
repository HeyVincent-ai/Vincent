import { Router, Response } from 'express';
import { AuditLogStatus } from '@prisma/client';
import { asyncHandler } from '../middleware/errorHandler';
import { sessionAuthMiddleware, requireSecretOwnership } from '../middleware/sessionAuth';
import { AuthenticatedRequest } from '../../types';
import { sendSuccess, errors } from '../../utils/response';
import { auditService } from '../../audit';

const router = Router({ mergeParams: true });

/**
 * GET /api/secrets/:secretId/audit-logs
 * List audit logs with filtering and pagination
 */
router.get(
  '/',
  sessionAuthMiddleware,
  requireSecretOwnership,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { secretId } = req.params as Record<string, string>;
    const { action, status, startDate, endDate, page, limit } = req.query as Record<string, string | undefined>;

    const result = await auditService.query({
      secretId,
      action: action || undefined,
      status: status && Object.values(AuditLogStatus).includes(status as AuditLogStatus)
        ? (status as AuditLogStatus)
        : undefined,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });

    sendSuccess(res, { logs: result.logs }, 200, result.pagination);
  })
);

/**
 * GET /api/secrets/:secretId/audit-logs/actions
 * Get distinct action types for filter dropdown
 */
router.get(
  '/actions',
  sessionAuthMiddleware,
  requireSecretOwnership,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { secretId } = req.params as Record<string, string>;
    const actions = await auditService.getActionTypes(secretId);
    sendSuccess(res, { actions });
  })
);

/**
 * GET /api/secrets/:secretId/audit-logs/export
 * Export audit logs as JSON (or CSV via Accept header)
 */
router.get(
  '/export',
  sessionAuthMiddleware,
  requireSecretOwnership,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { secretId } = req.params as Record<string, string>;
    const { action, status, startDate, endDate, format } = req.query as Record<string, string | undefined>;

    const logs = await auditService.exportLogs({
      secretId,
      action: action || undefined,
      status: status && Object.values(AuditLogStatus).includes(status as AuditLogStatus)
        ? (status as AuditLogStatus)
        : undefined,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });

    if (format === 'csv') {
      const header = 'id,action,status,errorMessage,ipAddress,userAgent,durationMs,createdAt\n';
      const rows = logs.map((l) =>
        [l.id, l.action, l.status, l.errorMessage ?? '', l.ipAddress ?? '', l.userAgent ?? '', l.durationMs ?? '', l.createdAt.toISOString()].map(
          (v) => `"${String(v).replace(/"/g, '""')}"`
        ).join(',')
      ).join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=audit-logs-${secretId}.csv`);
      res.send(header + rows);
      return;
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=audit-logs-${secretId}.json`);
    sendSuccess(res, { logs });
  })
);

/**
 * GET /api/secrets/:secretId/audit-logs/:logId
 * Get single audit log detail
 */
router.get(
  '/:logId',
  sessionAuthMiddleware,
  requireSecretOwnership,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { secretId, logId } = req.params as Record<string, string>;
    const log = await auditService.getById(logId, secretId);

    if (!log) {
      errors.notFound(res, 'Audit log');
      return;
    }

    sendSuccess(res, { log });
  })
);

export default router;
