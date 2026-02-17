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
    try {
      const { data } = await this.withRetry(() =>
        this.client.get('/api/skills/polymarket/positions')
      );
      // Handle various response formats from Vincent API
      // Format 1: { success: true, data: { openOrders: [...] } }
      if (data.success && data.data?.openOrders && Array.isArray(data.data.openOrders)) {
        return data.data.openOrders;
      }
      // Format 2: { data: { openOrders: [...] } }
      if (data.data?.openOrders && Array.isArray(data.data.openOrders)) {
        return data.data.openOrders;
      }
      // Format 3: { positions: [...] }
      if (data.positions && Array.isArray(data.positions)) {
        return data.positions;
      }
      // Format 4: Direct array
      if (Array.isArray(data)) {
        return data;
      }
      // No positions found, return empty array
      console.warn('[VincentClient] No positions found in response, returning empty array');
      return [];
    } catch (error: any) {
      // Log full error details for debugging
      console.error('[VincentClient] Failed to fetch positions:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
      });
      return []; // Return empty array on error
    }
  }

  async getMarketPrice(marketId: string, tokenId: string): Promise<number> {
    try {
      const { data } = await this.withRetry(() =>
        this.client.get('/api/skills/polymarket/markets', { params: { marketId, tokenId } })
      );
      // Handle nested Vincent response format
      const actualData = data.success ? data.data : data;
      return Number(actualData?.price ?? actualData?.markets?.[0]?.price ?? 0);
    } catch (error: any) {
      console.error('[VincentClient] Failed to fetch market price:', {
        marketId,
        tokenId,
        message: error.message,
      });
      return 0;
    }
  }

  async placeBet(input: Record<string, unknown>): Promise<{ orderId?: string; txHash?: string }> {
    try {
      const { data } = await this.withRetry(() =>
        this.client.post('/api/skills/polymarket/bet', input)
      );
      // Handle nested Vincent response format
      return data.success ? data.data : data;
    } catch (error: any) {
      console.error('[VincentClient] Failed to place bet:', {
        message: error.message,
        status: error.response?.status,
      });
      throw error;
    }
  }

  async getBalance(): Promise<Record<string, unknown>> {
    try {
      const { data } = await this.withRetry(() => this.client.get('/api/skills/polymarket/balance'));
      // Handle nested Vincent response format
      return data.success ? data.data : data;
    } catch (error: any) {
      console.error('[VincentClient] Failed to fetch balance:', error.message);
      return {};
    }
  }
}
