import { VincentClientService } from './vincentClient.service.js';

const getPrisma = async () => (await import('../db/client.js')).prisma;

export class PositionMonitorService {
  constructor(private readonly vincentClient: VincentClientService) {}

  async updatePositions(): Promise<any[]> {
    const prisma = await getPrisma();
    const positions = await this.vincentClient.getPositions();
    const now = new Date();

    await Promise.all(
      positions.map((position) =>
        prisma.monitoredPosition.upsert({
          where: {
            marketId_tokenId_side: {
              marketId: position.marketId,
              tokenId: position.tokenId,
              side: position.side,
            },
          },
          create: { ...position, lastUpdatedAt: now },
          update: {
            quantity: position.quantity,
            avgEntryPrice: position.avgEntryPrice,
            currentPrice: position.currentPrice,
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
