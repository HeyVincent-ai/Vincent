const getPrisma = async () => (await import('../db/client.js')).prisma;

export class EventLoggerService {
  async logEvent(
    ruleId: string,
    eventType:
      | 'RULE_CREATED'
      | 'RULE_EVALUATED'
      | 'RULE_TRAILING_UPDATED'
      | 'RULE_TRIGGERED'
      | 'RULE_CANCELED'
      | 'RULE_FAILED'
      | 'ACTION_ATTEMPT'
      | 'ACTION_EXECUTED'
      | 'ACTION_FAILED',
    eventData: unknown
  ): Promise<unknown> {
    const prisma = await getPrisma();
    return prisma.ruleEvent.create({
      data: {
        ruleId,
        eventType,
        eventData: JSON.stringify(eventData ?? {}),
      },
    });
  }

  async getEvents(ruleId?: string, limit = 100, offset = 0): Promise<Record<string, unknown>[]> {
    const prisma = await getPrisma();
    const rows = await prisma.ruleEvent.findMany({
      where: ruleId ? { ruleId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    return rows.map((row: Record<string, unknown>) => {
      const { eventData, ...rest } = row;
      let data: unknown = {};
      try {
        data = typeof eventData === 'string' ? JSON.parse(eventData) : eventData;
      } catch {
        data = eventData;
      }
      return { ...rest, data };
    });
  }
}
