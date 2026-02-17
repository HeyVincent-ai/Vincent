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

export interface VincentHolding {
  tokenId: string;
  shares: number;
  averageEntryPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
  marketTitle?: string;
  outcome?: string;
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

  async getHoldings(): Promise<VincentHolding[]> {
    try {
      const { data } = await this.withRetry(() =>
        this.client.get('/api/skills/polymarket/holdings')
      );

      // Handle nested Vincent response format
      // Format: { success: true, data: { walletAddress, holdings: [...] } }
      if (data.success && data.data?.holdings && Array.isArray(data.data.holdings)) {
        return data.data.holdings;
      }
      // Format 2: { data: { holdings: [...] } }
      if (data.data?.holdings && Array.isArray(data.data.holdings)) {
        return data.data.holdings;
      }
      // Format 3: { holdings: [...] }
      if (data.holdings && Array.isArray(data.holdings)) {
        return data.holdings;
      }
      // Format 4: Direct array
      if (Array.isArray(data)) {
        return data;
      }

      console.warn('[VincentClient] No holdings found in response, returning empty array');
      return [];
    } catch (error: any) {
      console.error('[VincentClient] Failed to fetch holdings:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
      });
      return []; // Return empty array on error
    }
  }

  async getMarketPrice(marketId: string, tokenId: string): Promise<number> {
    try {
      // Use orderbook endpoint to get price directly for the tokenId
      // This is more reliable than trying to match tokenIds from market data
      const { data } = await this.withRetry(() =>
        this.client.get(`/api/skills/polymarket/orderbook/${tokenId}`)
      );

      // Handle nested Vincent response format
      const actualData = data.success ? data.data : data;

      // Get the mid price from best bid and best ask
      const bids = actualData?.bids || [];
      const asks = actualData?.asks || [];

      if (bids.length === 0 && asks.length === 0) {
        console.warn('[VincentClient] No orderbook data for tokenId', { tokenId });
        return 0;
      }

      // Calculate mid price from best bid and best ask
      // Polymarket returns bids sorted ascending (lowest first), so take last element for highest bid
      // Polymarket returns asks sorted descending (highest first), so take last element for lowest ask
      const bestBid = bids.length > 0 && bids[bids.length - 1]?.price ? Number(bids[bids.length - 1].price) : 0;
      const bestAsk = asks.length > 0 && asks[asks.length - 1]?.price ? Number(asks[asks.length - 1].price) : 0;

      let price: number;
      if (bestBid > 0 && bestAsk > 0) {
        // Use mid price (average of bid and ask)
        price = (bestBid + bestAsk) / 2;
      } else if (bestBid > 0) {
        // Only bid available
        price = bestBid;
      } else if (bestAsk > 0) {
        // Only ask available
        price = bestAsk;
      } else {
        console.warn('[VincentClient] No valid prices in orderbook', { tokenId, bids, asks });
        return 0;
      }

      if (isNaN(price) || price <= 0 || price > 1) {
        console.warn('[VincentClient] Invalid price calculated', { tokenId, price, bestBid, bestAsk });
        return 0;
      }

      return price;
    } catch (error: any) {
      console.error('[VincentClient] Failed to fetch orderbook price:', {
        tokenId,
        message: error.message,
        response: error.response?.data,
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
