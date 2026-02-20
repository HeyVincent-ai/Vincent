import prisma from '../../db/client.js';
import type { TradeRuleEventType } from './types.js';

export async function logEvent(
  ruleId: string,
  eventType: TradeRuleEventType,
  eventData: unknown
): Promise<void> {
  await prisma.tradeRuleEvent.create({
    data: {
      ruleId,
      eventType,
      eventData: (eventData ?? {}) as object,
    },
  });
}

export async function getEvents(
  ruleId?: string,
  limit = 100,
  offset = 0
): Promise<Record<string, unknown>[]> {
  const rows = await prisma.tradeRuleEvent.findMany({
    where: ruleId ? { ruleId } : undefined,
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: offset,
  });

  return rows.map((row) => ({
    id: row.id,
    ruleId: row.ruleId,
    eventType: row.eventType,
    data: row.eventData,
    createdAt: row.createdAt,
  }));
}
