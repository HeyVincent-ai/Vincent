import { Request, Response, NextFunction } from 'express';
import { AuditLogStatus } from '@prisma/client';
import { getEndpointCost } from './registry.js';
import { deductCredit, refundCredit } from './credit.service.js';
import { logUsage } from './usage.service.js';
import { DataSourceRequest } from './middleware.js';
import { sendError } from '../utils/response.js';
import * as audit from '../audit/audit.service.js';

type ProxyHandler = (req: DataSourceRequest) => Promise<unknown>;

/**
 * Wraps a data source proxy handler with credit deduction, usage logging,
 * and audit logging.
 *
 * Returns an Express handler that:
 * 1. Looks up endpoint cost from the registry
 * 2. Atomically deducts credit (prevents race-condition overdraft)
 * 3. Calls the upstream handler
 * 4. On success: logs usage, appends _vincent metadata
 * 5. On failure: refunds credit, returns upstream error
 */
export function wrapProxy(
  dataSourceId: string,
  endpointId: string,
  handler: ProxyHandler
): (req: Request, res: Response, next: NextFunction) => Promise<void> {
  return async (req: Request, res: Response): Promise<void> => {
    const dsReq = req as DataSourceRequest;
    const startTime = Date.now();
    const cost = getEndpointCost(dataSourceId, endpointId);

    if (cost === undefined) {
      sendError(res, 'UNKNOWN_ENDPOINT', `Unknown endpoint: ${dataSourceId}/${endpointId}`, 404);
      return;
    }

    const userId = dsReq.dataSourceUser.id;

    // Atomically deduct credit BEFORE calling the external API to prevent race conditions.
    // If deductCredit throws (insufficient balance), the AppError propagates to Express error handler.
    const newBalance = await deductCredit(userId, cost);

    try {
      // Call upstream handler
      const result = await handler(dsReq);

      // Log usage (fire-and-forget)
      logUsage({
        userId,
        secretId: dsReq.secret!.id,
        apiKeyId: dsReq.apiKey?.id,
        dataSource: dataSourceId,
        endpoint: endpointId,
        costUsd: cost,
        metadata: { query: dsReq.query },
      }).catch(console.error);

      // Audit log (fire-and-forget)
      audit
        .log({
          secretId: dsReq.secret!.id,
          apiKeyId: dsReq.apiKey?.id,
          userId,
          action: `datasource.${dataSourceId}.${endpointId}`,
          inputData: { query: dsReq.query, params: dsReq.params },
          status: AuditLogStatus.SUCCESS,
          durationMs: Date.now() - startTime,
        })
        .catch(console.error);

      // Return result with _vincent metadata
      res.json({
        ...(result as object),
        _vincent: {
          cost: cost.toFixed(6),
          balance: newBalance.toFixed(2),
        },
      });
    } catch (err: unknown) {
      // Refund credit if the external API call failed
      try {
        await refundCredit(userId, cost);
      } catch (refundErr) {
        console.error('CRITICAL: credit refund failed', { userId, costUsd: cost, refundErr });
      }

      // Audit log failure (fire-and-forget)
      audit
        .log({
          secretId: dsReq.secret!.id,
          apiKeyId: dsReq.apiKey?.id,
          userId,
          action: `datasource.${dataSourceId}.${endpointId}`,
          inputData: { query: dsReq.query, params: dsReq.params },
          status: AuditLogStatus.FAILED,
          errorMessage: err instanceof Error ? err.message : 'Unknown error',
          durationMs: Date.now() - startTime,
        })
        .catch(console.error);

      // Re-throw to let Express error handler deal with it
      throw err;
    }
  };
}
