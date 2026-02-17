import { z } from 'zod';
import { HttpError } from '../utils/httpError.js';
import { EventLoggerService } from './eventLogger.service.js';

const getPrisma = async () => (await import('../db/client.js')).prisma;

const actionSchema = z.union([
  z.object({ type: z.literal('SELL_ALL') }),
  z.object({ type: z.literal('SELL_PARTIAL'), amount: z.number().positive() }),
]);

export const createRuleSchema = z.object({
  ruleType: z.enum(['STOP_LOSS', 'TAKE_PROFIT']),
  marketId: z.string().min(1),
  tokenId: z.string().min(1),
  side: z.enum(['BUY', 'SELL']).default('BUY'),
  triggerPrice: z.number().gt(0).lt(1),
  trailingPercent: z.number().positive().optional(),
  action: actionSchema,
});

export const updateRuleSchema = z.object({ triggerPrice: z.number().gt(0).lt(1) });

export class RuleManagerService {
  constructor(private readonly eventLogger = new EventLoggerService()) {}

  async createRule(input: z.infer<typeof createRuleSchema>): Promise<any> {
    const payload = createRuleSchema.parse(input);
    const prisma = await getPrisma();
    const rule = await prisma.tradeRule.create({
      data: { ...payload, action: JSON.stringify(payload.action) },
    });
    await this.eventLogger.logEvent(rule.id, 'RULE_CREATED', { payload });
    return rule;
  }

  async getRules(status?: string): Promise<any[]> {
    const prisma = await getPrisma();
    return prisma.tradeRule.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getRule(id: string): Promise<any> {
    const prisma = await getPrisma();
    const rule = await prisma.tradeRule.findUnique({ where: { id } });
    if (!rule) throw new HttpError(404, 'Rule not found');
    return rule;
  }

  async updateRule(id: string, data: z.infer<typeof updateRuleSchema>): Promise<any> {
    updateRuleSchema.parse(data);
    const existing = await this.getRule(id);
    if (existing.status !== 'ACTIVE') throw new HttpError(400, 'Only active rules can be updated');
    const prisma = await getPrisma();
    return prisma.tradeRule.update({ where: { id }, data: { triggerPrice: data.triggerPrice } });
  }

  async cancelRule(id: string): Promise<any> {
    const existing = await this.getRule(id);
    // Allow canceling ACTIVE or FAILED rules (but not already CANCELED or TRIGGERED)
    if (existing.status !== 'ACTIVE' && existing.status !== 'FAILED') {
      throw new HttpError(400, 'Only active or failed rules can be canceled');
    }
    const prisma = await getPrisma();
    const rule = await prisma.tradeRule.update({ where: { id }, data: { status: 'CANCELED' } });
    await this.eventLogger.logEvent(id, 'RULE_CANCELED', {});
    return rule;
  }

  async markRuleTriggered(id: string, txHash?: string): Promise<boolean> {
    const prisma = await getPrisma();
    const result = await prisma.tradeRule.updateMany({
      where: { id, status: 'ACTIVE' },
      data: { status: 'TRIGGERED', triggeredAt: new Date(), triggerTxHash: txHash },
    });
    return result.count === 1;
  }

  async getRuleEvents(ruleId?: string): Promise<unknown[]> {
    return this.eventLogger.getEvents(ruleId);
  }
}
