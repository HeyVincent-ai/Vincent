import axios, { AxiosInstance } from 'axios';
import type { TradeManagerConfig } from '../config/config.js';

export interface VincentPosition {
  marketId: string;
  tokenId: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  avgEntryPrice?: number;
  currentPrice: number;
}

export class VincentClientService {
  private readonly client: AxiosInstance;
  private readonly maxRetries = 3;

  constructor(config: TradeManagerConfig) {
    this.client = axios.create({
      baseURL: config.vincentApiUrl,
      headers: { Authorization: `Bearer ${config.vincentApiKey}` },
      timeout: 10_000,
    });
  }

  private async withRetry<T>(fn: () => Promise<T>, attempt = 1): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= this.maxRetries) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 250));
      return this.withRetry(fn, attempt + 1);
    }
  }

  async getPositions(): Promise<VincentPosition[]> {
    const { data } = await this.withRetry(() =>
      this.client.get('/api/skills/polymarket/positions')
    );
    return data.positions ?? data;
  }

  async getMarketPrice(marketId: string, tokenId: string): Promise<number> {
    const { data } = await this.withRetry(() =>
      this.client.get('/api/skills/polymarket/markets', { params: { marketId, tokenId } })
    );
    return Number(data.price ?? data.markets?.[0]?.price ?? 0);
  }

  async placeBet(input: Record<string, unknown>): Promise<{ orderId?: string; txHash?: string }> {
    const { data } = await this.withRetry(() =>
      this.client.post('/api/skills/polymarket/bet', input)
    );
    return data;
  }

  async getBalance(): Promise<Record<string, unknown>> {
    const { data } = await this.withRetry(() => this.client.get('/api/skills/polymarket/balance'));
    return data;
  }
}
