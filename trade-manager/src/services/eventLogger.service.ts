const getPrisma = async () => (await import('../db/client.js')).prisma;

export class EventLoggerService {
  async logEvent(
    ruleId: string,
    eventType:
      | 'RULE_CREATED'
      | 'RULE_EVALUATED'
      | 'RULE_TRIGGERED'
      | 'RULE_CANCELED'
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

  async getEvents(ruleId?: string, limit = 100): Promise<unknown[]> {
    const prisma = await getPrisma();
    return prisma.ruleEvent.findMany({
      where: ruleId ? { ruleId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
