import { AuditLogStatus } from '@prisma/client';
import prisma from '../db/client.js';

/** Strip ::ffff: prefix from IPv4-mapped IPv6 addresses */
function normalizeIp(ip?: string): string | undefined {
  if (!ip) return undefined;
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

export interface AuditLogEntry {
  secretId?: string;
  apiKeyId?: string;
  userId?: string;
  action: string;
  inputData?: unknown;
  outputData?: unknown;
  status: AuditLogStatus;
  errorMessage?: string;
  ipAddress?: string;
  userAgent?: string;
  durationMs?: number;
}

export interface AuditLogFilter {
  secretId: string;
  action?: string;
  status?: AuditLogStatus;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}

/**
 * Create an audit log entry. Fire-and-forget safe — errors are caught and logged.
 */
export async function log(entry: AuditLogEntry): Promise<string | null> {
  try {
    const record = await prisma.auditLog.create({
      data: {
        secretId: entry.secretId ?? null,
        apiKeyId: entry.apiKeyId ?? null,
        userId: entry.userId ?? null,
        action: entry.action,
        inputData: entry.inputData !== undefined ? (entry.inputData as object) : undefined,
        outputData: entry.outputData !== undefined ? (entry.outputData as object) : undefined,
        status: entry.status,
        errorMessage: entry.errorMessage ?? null,
        ipAddress: normalizeIp(entry.ipAddress) ?? null,
        userAgent: entry.userAgent ?? null,
        durationMs: entry.durationMs ?? null,
      },
    });
    return record.id;
  } catch (err) {
    console.error('Failed to write audit log:', err);
    return null;
  }
}

/**
 * Query audit logs for a secret with filtering and pagination.
 */
export async function query(filter: AuditLogFilter) {
  const page = filter.page ?? 1;
  const limit = Math.min(filter.limit ?? 50, 200);
  const offset = (page - 1) * limit;

  const where: Record<string, unknown> = { secretId: filter.secretId };

  if (filter.action) where.action = filter.action;
  if (filter.status) where.status = filter.status;
  if (filter.startDate || filter.endDate) {
    const createdAt: Record<string, Date> = {};
    if (filter.startDate) createdAt.gte = filter.startDate;
    if (filter.endDate) createdAt.lte = filter.endDate;
    where.createdAt = createdAt;
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    logs,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Get a single audit log entry.
 */
export async function getById(logId: string, secretId: string) {
  return prisma.auditLog.findFirst({
    where: { id: logId, secretId },
  });
}

/**
 * Get distinct action types for a secret (useful for filter dropdowns).
 */
export async function getActionTypes(secretId: string): Promise<string[]> {
  const results = await prisma.auditLog.findMany({
    where: { secretId },
    select: { action: true },
    distinct: ['action'],
    orderBy: { action: 'asc' },
  });
  return results.map((r) => r.action);
}

/**
 * Export audit logs (no pagination, respects filters).
 */
export async function exportLogs(filter: Omit<AuditLogFilter, 'page' | 'limit'>) {
  const where: Record<string, unknown> = { secretId: filter.secretId };

  if (filter.action) where.action = filter.action;
  if (filter.status) where.status = filter.status;
  if (filter.startDate || filter.endDate) {
    const createdAt: Record<string, Date> = {};
    if (filter.startDate) createdAt.gte = filter.startDate;
    if (filter.endDate) createdAt.lte = filter.endDate;
    where.createdAt = createdAt;
  }

  return prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 10000, // safety cap
  });
}
