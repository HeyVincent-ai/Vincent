import prisma from '../../db/client.js';
import * as polymarketSkill from '../../skills/polymarketSkill.service.js';

/** Fetch holdings from Polymarket and upsert monitored positions for a single secret. */
export async function updatePositions(secretId: string): Promise<void> {
  const { holdings } = await polymarketSkill.getHoldings(secretId);
  const now = new Date();

  // Filter out resolved markets and empty positions
  const activeHoldings = holdings.filter((h) => !h.redeemable && h.shares > 0);

  await Promise.all(
    activeHoldings.map((holding) =>
      prisma.tradeMonitoredPosition.upsert({
        where: {
          secretId_marketId_tokenId_side: {
            secretId,
            marketId: holding.conditionId,
            tokenId: holding.tokenId,
            side: 'BUY',
          },
        },
        create: {
          secretId,
          marketId: holding.conditionId,
          marketSlug: holding.marketSlug,
          tokenId: holding.tokenId,
          side: 'BUY',
          quantity: holding.shares,
          avgEntryPrice: holding.averageEntryPrice,
          currentPrice: holding.currentPrice,
          marketTitle: holding.marketTitle,
          outcome: holding.outcome,
          endDate: holding.endDate,
          redeemable: holding.redeemable || false,
          lastUpdatedAt: now,
        },
        update: {
          quantity: holding.shares,
          avgEntryPrice: holding.averageEntryPrice,
          currentPrice: holding.currentPrice,
          marketTitle: holding.marketTitle,
          marketSlug: holding.marketSlug,
          outcome: holding.outcome,
          endDate: holding.endDate,
          redeemable: holding.redeemable || false,
          lastUpdatedAt: now,
        },
      })
    )
  );
}

/** Update positions for every distinct secretId that has active rules. */
export async function updateAllPositions(): Promise<void> {
  const distinctSecrets = await prisma.tradeRule.findMany({
    where: { status: 'ACTIVE' },
    distinct: ['secretId'],
    select: { secretId: true },
  });

  const results = await Promise.allSettled(
    distinctSecrets.map(({ secretId }) => updatePositions(secretId))
  );

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'rejected') {
      console.error(
        `[TradeManager] Failed to update positions for secret ${distinctSecrets[i].secretId}:`,
        result.reason
      );
    }
  }
}

export async function getPosition(secretId: string, marketId: string, tokenId: string) {
  return prisma.tradeMonitoredPosition.findFirst({
    where: { secretId, marketId, tokenId },
  });
}

export async function getPositions(secretId: string) {
  return prisma.tradeMonitoredPosition.findMany({
    where: { secretId },
    orderBy: { updatedAt: 'desc' },
  });
}

/** HTTP fallback price lookup — used when WebSocket price isn't cached. */
export async function getCurrentPrice(tokenId: string): Promise<number> {
  const mid = await polymarketSkill.getMidpoint(tokenId);
  return parseFloat(mid);
}
