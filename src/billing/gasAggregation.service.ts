import { Decimal } from '@prisma/client/runtime/library';
import prisma from '../db/client';

/**
 * Get current month string in YYYY-MM format.
 */
export function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Get start of a month from a YYYY-MM string.
 */
function monthStart(month: string): Date {
  return new Date(`${month}-01T00:00:00.000Z`);
}

/**
 * Get start of next month from a YYYY-MM string.
 */
function nextMonthStart(month: string): Date {
  const [year, m] = month.split('-').map(Number);
  if (m === 12) {
    return new Date(`${year + 1}-01-01T00:00:00.000Z`);
  }
  return new Date(`${year}-${String(m + 1).padStart(2, '0')}-01T00:00:00.000Z`);
}

/**
 * Aggregate gas usage for a user for a specific month.
 * Creates or updates a MonthlyGasSummary record.
 */
export async function aggregateMonthlyGas(
  userId: string,
  month: string
): Promise<{ totalCostUsd: number; transactionCount: number }> {
  const result = await prisma.gasUsage.aggregate({
    where: {
      userId,
      createdAt: {
        gte: monthStart(month),
        lt: nextMonthStart(month),
      },
    },
    _sum: { costUsd: true },
    _count: true,
  });

  const totalCostUsd = result._sum.costUsd?.toNumber() ?? 0;

  await prisma.monthlyGasSummary.upsert({
    where: { userId_month: { userId, month } },
    create: {
      userId,
      month,
      totalCostUsd: new Decimal(totalCostUsd),
      billed: false,
    },
    update: {
      totalCostUsd: new Decimal(totalCostUsd),
    },
  });

  return { totalCostUsd, transactionCount: result._count };
}

/**
 * Get gas usage summary for a user for a specific month.
 */
export async function getMonthlyGasSummary(userId: string, month: string) {
  return prisma.monthlyGasSummary.findUnique({
    where: { userId_month: { userId, month } },
  });
}

/**
 * Get gas usage history for a user (all monthly summaries).
 */
export async function getGasUsageHistory(userId: string) {
  return prisma.monthlyGasSummary.findMany({
    where: { userId },
    orderBy: { month: 'desc' },
  });
}

/**
 * Get current month gas usage details for a user.
 */
export async function getCurrentMonthUsage(userId: string) {
  const month = getCurrentMonth();

  const [aggregate, transactions] = await Promise.all([
    prisma.gasUsage.aggregate({
      where: {
        userId,
        createdAt: {
          gte: monthStart(month),
          lt: nextMonthStart(month),
        },
      },
      _sum: { costUsd: true },
      _count: true,
    }),
    prisma.gasUsage.findMany({
      where: {
        userId,
        createdAt: {
          gte: monthStart(month),
          lt: nextMonthStart(month),
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        transactionHash: true,
        chainId: true,
        costUsd: true,
        createdAt: true,
        secretId: true,
      },
    }),
  ]);

  return {
    month,
    totalCostUsd: aggregate._sum.costUsd?.toNumber() ?? 0,
    transactionCount: aggregate._count,
    recentTransactions: transactions.map((t) => ({
      ...t,
      costUsd: t.costUsd.toNumber(),
    })),
  };
}

/**
 * Run monthly aggregation for all users with gas usage.
 * Intended to be called by a cron job at end of month.
 */
export async function runMonthlyAggregation(month: string) {
  const usersWithGas = await prisma.gasUsage.findMany({
    where: {
      createdAt: {
        gte: monthStart(month),
        lt: nextMonthStart(month),
      },
    },
    distinct: ['userId'],
    select: { userId: true },
  });

  const results = [];
  for (const { userId } of usersWithGas) {
    if (!userId) continue;
    const result = await aggregateMonthlyGas(userId, month);
    results.push({ userId, ...result });
  }

  return results;
}
