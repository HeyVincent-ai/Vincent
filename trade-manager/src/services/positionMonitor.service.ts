import { VincentClientService } from './vincentClient.service.js';

const getPrisma = async () => (await import('../db/client.js')).prisma;

export class PositionMonitorService {
  constructor(private readonly vincentClient: VincentClientService) {}

  async updatePositions(): Promise<any[]> {
    const prisma = await getPrisma();
    const holdings = await this.vincentClient.getHoldings();
    const now = new Date();

    // Filter out resolved markets and empty positions.
    // Only use `redeemable` to detect resolved markets — endDate is the
    // *expected* resolution date and markets frequently trade past it.
    const activeHoldings = holdings.filter((holding) => {
      if (holding.redeemable) return false;
      if (holding.shares <= 0) return false;
      return true;
    });

    await Promise.all(
      activeHoldings.map((holding) =>
        prisma.monitoredPosition.upsert({
          where: {
            marketId_tokenId_side: {
              marketId: holding.tokenId, // Use tokenId as marketId for holdings
              tokenId: holding.tokenId,
              side: 'BUY', // Holdings are always BUY side (shares you own)
            },
          },
          create: {
            marketId: holding.tokenId,
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

    return prisma.monitoredPosition.findMany({ orderBy: { updatedAt: 'desc' } });
  }

  async getPosition(marketId: string, tokenId: string): Promise<any | null> {
    const prisma = await getPrisma();
    return prisma.monitoredPosition.findFirst({ where: { marketId, tokenId } });
  }

  async getCurrentPrice(marketId: string, tokenId: string): Promise<number> {
    return this.vincentClient.getMarketPrice(marketId, tokenId);
  }

  async updatePositionPrice(marketId: string, tokenId: string, price: number): Promise<void> {
    const prisma = await getPrisma();
    await prisma.monitoredPosition.updateMany({
      where: { marketId, tokenId },
      data: { currentPrice: price, lastUpdatedAt: new Date() },
    });
  }

  async getPositions(): Promise<any[]> {
    const prisma = await getPrisma();
    return prisma.monitoredPosition.findMany({ orderBy: { updatedAt: 'desc' } });
  }
}
