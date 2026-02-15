import { Prisma } from '@prisma/client';
import prisma from '../db/client.js';

export interface LogUsageParams {
  userId: string;
  secretId: string;
  apiKeyId?: string;
  dataSource: string;
  endpoint: string;
  costUsd: number;
  metadata?: Record<string, unknown>;
}

/**
 * Log a data source usage record.
 */
export async function logUsage(params: LogUsageParams): Promise<void> {
  await prisma.dataSourceUsage.create({
    data: {
      userId: params.userId,
      secretId: params.secretId,
      apiKeyId: params.apiKeyId ?? null,
      dataSource: params.dataSource,
      endpoint: params.endpoint,
      costUsd: params.costUsd,
      requestMetadata: params.metadata
        ? (params.metadata as Prisma.InputJsonValue)
        : Prisma.JsonNull,
    },
  });
}

/**
 * Get current month usage summary grouped by data source.
 */
export async function getUsageSummary(userId: string) {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const results = await prisma.dataSourceUsage.groupBy({
    by: ['dataSource'],
    where: {
      userId,
      createdAt: { gte: startOfMonth },
    },
    _count: { id: true },
    _sum: { costUsd: true },
  });

  return results.map((r) => ({
    dataSource: r.dataSource,
    requestCount: r._count.id,
    totalCostUsd: r._sum.costUsd?.toNumber() ?? 0,
  }));
}

/**
 * Get monthly usage totals for a user.
 */
export async function getUsageHistory(userId: string) {
  const results = await prisma.$queryRaw<
    Array<{ month: string; data_source: string; request_count: bigint; total_cost: number }>
  >`
    SELECT
      TO_CHAR("created_at", 'YYYY-MM') as month,
      "data_source",
      COUNT(*)::bigint as request_count,
      SUM("cost_usd")::numeric as total_cost
    FROM "data_source_usage"
    WHERE "user_id" = ${userId}
    GROUP BY month, "data_source"
    ORDER BY month DESC, "data_source"
    LIMIT 120
  `;

  return results.map((r) => ({
    month: r.month,
    dataSource: r.data_source,
    requestCount: Number(r.request_count),
    totalCostUsd: Number(r.total_cost),
  }));
}

/**
 * Get usage for a specific secret.
 */
export async function getUsageBySecret(secretId: string) {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const results = await prisma.dataSourceUsage.groupBy({
    by: ['dataSource', 'endpoint'],
    where: {
      secretId,
      createdAt: { gte: startOfMonth },
    },
    _count: { id: true },
    _sum: { costUsd: true },
  });

  return results.map((r) => ({
    dataSource: r.dataSource,
    endpoint: r.endpoint,
    requestCount: r._count.id,
    totalCostUsd: r._sum.costUsd?.toNumber() ?? 0,
  }));
}
