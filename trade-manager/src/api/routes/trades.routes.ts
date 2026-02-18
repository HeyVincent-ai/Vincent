import { Router } from 'express';
import { EventLoggerService } from '../../services/eventLogger.service.js';
import { prisma } from '../../db/client.js';

export const createTradesRoutes = (_eventLogger: EventLoggerService): Router => {
  const router = Router();

  router.get('/api/trades', async (req, res) => {
    try {
      // Get all ACTION_EXECUTED events
      const events = await prisma.ruleEvent.findMany({
        where: {
          eventType: 'ACTION_EXECUTED',
        },
        include: {
          rule: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 100,
      });

      // Format the response with enriched trade data
      // Keep only confirmed executions that include a concrete result payload.
      const trades = events
        .map((event) => {
          let eventData: any = {};
          try {
            eventData = JSON.parse(event.eventData);
          } catch {
            // ignore parse errors
          }

          if (!eventData.result) return null;

          return {
            id: event.id,
            timestamp: event.createdAt,
            ruleId: event.ruleId,
            ruleType: event.rule.ruleType,
            marketId: event.rule.marketId,
            marketSlug: event.rule.marketSlug,
            tokenId: event.rule.tokenId,
            side: event.rule.side,
            triggerPrice: event.rule.triggerPrice,
            txHash: eventData.result?.txHash,
            orderId: eventData.result?.orderId,
            amount: eventData.result?.amount,
            price: eventData.result?.price,
            status: eventData.result?.status || 'EXECUTED',
          };
        })
        .filter((trade): trade is NonNullable<typeof trade> => trade !== null);

      res.json(trades);
    } catch (error) {
      console.error('Error fetching trades:', error);
      res.status(500).json({ error: 'Failed to fetch trades' });
    }
  });

  return router;
};
