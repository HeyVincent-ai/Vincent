import WebSocket from 'ws';
import { EventEmitter } from 'events';
import type { PriceUpdate, OrderBookUpdate, WebSocketMessage } from './types.js';

export interface PolymarketWebSocketConfig {
  url?: string;
  reconnectInitialDelay?: number;
  reconnectMaxDelay?: number;
  reconnectBackoffMultiplier?: number;
}

export class PolymarketWebSocketService extends EventEmitter {
  private ws?: WebSocket;
  private readonly url: string;
  private subscribedTokenIds = new Set<string>();
  private reconnectAttempts = 0;
  private readonly reconnectInitialDelay: number;
  private readonly reconnectMaxDelay: number;
  private readonly reconnectBackoffMultiplier: number;
  private reconnectTimer?: NodeJS.Timeout;
  private isConnected = false;
  private isIntentionallyClosed = false;
  private pingInterval?: NodeJS.Timeout;

  constructor(config: PolymarketWebSocketConfig = {}) {
    super();
    this.url = config.url || 'wss://ws-subscriptions-clob.polymarket.com/ws/market';
    this.reconnectInitialDelay = config.reconnectInitialDelay || 1000;
    this.reconnectMaxDelay = config.reconnectMaxDelay || 60000;
    this.reconnectBackoffMultiplier = config.reconnectBackoffMultiplier || 2;
  }

  connect(): void {
    if (this.ws) return;

    this.isIntentionallyClosed = false;
    console.log(`[TradeManager:WS] Connecting to ${this.url}`);

    this.ws = new WebSocket(this.url);

    this.ws.on('open', () => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      console.log('[TradeManager:WS] Connected');
      this.emit('connected');

      // Resubscribe to all previously subscribed tokens
      if (this.subscribedTokenIds.size > 0) {
        this.sendSubscription(Array.from(this.subscribedTokenIds), 'subscribe');
      }
      this.startPingInterval();
    });

    this.ws.on('message', (data: WebSocket.Data) => {
      const rawData = data.toString();

      if (!rawData.startsWith('{') && !rawData.startsWith('[')) {
        if (rawData.includes('INVALID') || rawData.includes('ERROR')) {
          this.emit('error', new Error(`WebSocket server error: ${rawData}`));
        }
        return;
      }

      try {
        const message = JSON.parse(rawData) as WebSocketMessage;
        this.handleMessage(message);
      } catch {
        // Ignore parse errors
      }
    });

    this.ws.on('error', (error) => {
      console.error('[TradeManager:WS] Error:', error.message);
      this.emit('error', error);
    });

    this.ws.on('close', (code, reason) => {
      this.isConnected = false;
      this.stopPingInterval();
      console.warn(`[TradeManager:WS] Closed (code=${code}, reason=${reason.toString()})`);
      this.emit('disconnected');

      if (!this.isIntentionallyClosed) {
        this.scheduleReconnect();
      }
    });

    this.ws.on('pong', () => {
      // keep-alive acknowledged
    });
  }

  disconnect(): void {
    this.isIntentionallyClosed = true;
    this.stopPingInterval();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = undefined;
    }

    this.isConnected = false;
    console.log('[TradeManager:WS] Disconnected');
  }

  subscribeToTokens(tokenIds: string[]): void {
    if (tokenIds.length === 0) return;
    tokenIds.forEach((id) => this.subscribedTokenIds.add(id));

    if (this.isConnected && this.ws) {
      this.sendSubscription(tokenIds, 'subscribe');
    }
  }

  unsubscribeFromTokens(tokenIds: string[]): void {
    if (tokenIds.length === 0) return;
    tokenIds.forEach((id) => this.subscribedTokenIds.delete(id));

    if (this.isConnected && this.ws) {
      this.sendSubscription(tokenIds, 'unsubscribe');
    }
  }

  getSubscribedTokens(): string[] {
    return Array.from(this.subscribedTokenIds);
  }

  isConnectionOpen(): boolean {
    return this.isConnected;
  }

  private sendSubscription(tokenIds: string[], operation: 'subscribe' | 'unsubscribe'): void {
    if (!this.ws || !this.isConnected) return;

    const message = {
      auth: {},
      type: 'market',
      assets_ids: tokenIds,
      operation,
    };
    this.ws.send(JSON.stringify(message));
  }

  private handleMessage(message: WebSocketMessage): void {
    switch (message.event_type) {
      case 'book':
        this.handleBookUpdate(message);
        break;
      case 'last_trade_price':
        this.handleLastTradePrice(message);
        break;
      default:
        break;
    }
  }

  private handleBookUpdate(message: WebSocketMessage): void {
    const buys = message.buys || [];
    const sells = message.sells || [];

    if (buys.length === 0 && sells.length === 0) return;

    const price = this.calculateMidPrice(buys, sells);
    if (price > 0) {
      this.emitPriceUpdate(message.asset_id, price, message.timestamp);
    }

    this.emit('orderbook', {
      asset_id: message.asset_id,
      market: message.market,
      timestamp: message.timestamp,
      hash: message.hash,
      buys,
      sells,
    } as OrderBookUpdate);
  }

  private handleLastTradePrice(message: WebSocketMessage): void {
    if (message.price) {
      const price = parseFloat(message.price);
      if (!isNaN(price) && price > 0 && price <= 1) {
        this.emitPriceUpdate(message.asset_id, price, message.timestamp);
      }
    }
  }

  private calculateMidPrice(
    buys: Array<{ price: string; size: string }>,
    sells: Array<{ price: string; size: string }>
  ): number {
    const bestBid = buys.length > 0 ? parseFloat(buys[0].price) : 0;
    const bestAsk = sells.length > 0 ? parseFloat(sells[0].price) : 0;

    if (bestBid > 0 && bestAsk > 0) return (bestBid + bestAsk) / 2;
    if (bestBid > 0) return bestBid;
    if (bestAsk > 0) return bestAsk;
    return 0;
  }

  private emitPriceUpdate(tokenId: string, price: number, timestamp: number): void {
    this.emit('price', { tokenId, price, timestamp } as PriceUpdate);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.isIntentionallyClosed) return;

    const delay = Math.min(
      this.reconnectInitialDelay *
        Math.pow(this.reconnectBackoffMultiplier, this.reconnectAttempts),
      this.reconnectMaxDelay
    );

    console.log(
      `[TradeManager:WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1})`
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.reconnectAttempts += 1;
      this.ws = undefined;
      this.connect();
    }, delay);
  }

  private startPingInterval(): void {
    this.stopPingInterval();
    this.pingInterval = setInterval(() => {
      if (this.ws && this.isConnected) {
        this.ws.ping();
      }
    }, 30000);
  }

  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = undefined;
    }
  }
}
