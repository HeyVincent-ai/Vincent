import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';

export interface PriceUpdate {
  tokenId: string;
  price: number;
  timestamp: number;
}

export interface OrderBookUpdate {
  asset_id: string;
  market: string;
  timestamp: number;
  hash: string;
  buys: Array<{ price: string; size: string }>;
  sells: Array<{ price: string; size: string }>;
}

export interface WebSocketMessage {
  event_type: 'book' | 'price_change' | 'last_trade_price' | 'best_bid_ask' | 'tick_size_change' | 'new_market' | 'market_resolved';
  asset_id: string;
  market?: string;
  timestamp: number;
  hash?: string;
  price?: string;
  buys?: Array<{ price: string; size: string }>;
  sells?: Array<{ price: string; size: string }>;
}

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
    if (this.ws) {
      logger.warn('[PolymarketWS] Already connected or connecting');
      return;
    }

    this.isIntentionallyClosed = false;
    logger.info({ url: this.url }, '[PolymarketWS] Connecting to WebSocket');

    this.ws = new WebSocket(this.url);

    this.ws.on('open', () => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      logger.info('[PolymarketWS] Connected successfully');
      this.emit('connected');

      // Resubscribe to all previously subscribed tokens
      if (this.subscribedTokenIds.size > 0) {
        const tokenIds = Array.from(this.subscribedTokenIds);
        logger.info({ count: tokenIds.length }, '[PolymarketWS] Resubscribing to tokens');
        this.sendSubscription(tokenIds, 'subscribe');
      }

      // Start ping interval to keep connection alive
      this.startPingInterval();
    });

    this.ws.on('message', (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString()) as WebSocketMessage;
        this.handleMessage(message);
      } catch (error) {
        logger.error({ error, data: data.toString() }, '[PolymarketWS] Failed to parse message');
      }
    });

    this.ws.on('error', (error) => {
      logger.error({ error: error.message }, '[PolymarketWS] WebSocket error');
      this.emit('error', error);
    });

    this.ws.on('close', (code, reason) => {
      this.isConnected = false;
      this.stopPingInterval();
      logger.warn({ code, reason: reason.toString() }, '[PolymarketWS] Connection closed');
      this.emit('disconnected');

      // Only attempt reconnection if not intentionally closed
      if (!this.isIntentionallyClosed) {
        this.scheduleReconnect();
      }
    });

    this.ws.on('pong', () => {
      logger.debug('[PolymarketWS] Received pong');
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
    logger.info('[PolymarketWS] Disconnected');
  }

  subscribeToTokens(tokenIds: string[]): void {
    if (tokenIds.length === 0) return;

    // Add to our tracking set
    tokenIds.forEach((id) => this.subscribedTokenIds.add(id));

    // Send subscription if connected
    if (this.isConnected && this.ws) {
      this.sendSubscription(tokenIds, 'subscribe');
    } else {
      logger.info({ count: tokenIds.length }, '[PolymarketWS] Queued subscription for tokens');
    }
  }

  unsubscribeFromTokens(tokenIds: string[]): void {
    if (tokenIds.length === 0) return;

    // Remove from our tracking set
    tokenIds.forEach((id) => this.subscribedTokenIds.delete(id));

    // Send unsubscription if connected
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
    if (!this.ws || !this.isConnected) {
      logger.warn('[PolymarketWS] Cannot send subscription - not connected');
      return;
    }

    const message = {
      auth: {},
      type: 'market',
      assets_ids: tokenIds,
      ...(operation === 'unsubscribe' ? { operation: 'unsubscribe' } : {}),
    };

    this.ws.send(JSON.stringify(message));
    logger.info({ tokenCount: tokenIds.length }, `[PolymarketWS] Sent ${operation} request`);
  }

  private handleMessage(message: WebSocketMessage): void {
    const { event_type, asset_id } = message;

    logger.debug({ event_type, asset_id }, '[PolymarketWS] Received message');

    switch (event_type) {
      case 'book':
        this.handleBookUpdate(message);
        break;
      case 'price_change':
        this.handlePriceChange(message);
        break;
      case 'last_trade_price':
        this.handleLastTradePrice(message);
        break;
      case 'best_bid_ask':
        this.handleBestBidAsk(message);
        break;
      default:
        logger.debug({ event_type }, '[PolymarketWS] Unhandled message type');
    }
  }

  private handleBookUpdate(message: WebSocketMessage): void {
    if (!message.buys || !message.sells) {
      logger.warn({ asset_id: message.asset_id }, '[PolymarketWS] Book update missing buys or sells');
      return;
    }

    const price = this.calculateMidPrice(message.buys, message.sells);
    if (price > 0) {
      this.emitPriceUpdate(message.asset_id, price, message.timestamp);
    }

    // Also emit raw orderbook update
    this.emit('orderbook', {
      asset_id: message.asset_id,
      market: message.market,
      timestamp: message.timestamp,
      hash: message.hash,
      buys: message.buys,
      sells: message.sells,
    } as OrderBookUpdate);
  }

  private handlePriceChange(message: WebSocketMessage): void {
    // Price change events don't include the actual price, just notification
    // We rely on orderbook updates for actual prices
    logger.debug({ asset_id: message.asset_id }, '[PolymarketWS] Price change event');
    this.emit('price_change', { asset_id: message.asset_id, timestamp: message.timestamp });
  }

  private handleLastTradePrice(message: WebSocketMessage): void {
    if (message.price) {
      const price = parseFloat(message.price);
      if (!isNaN(price) && price > 0 && price <= 1) {
        this.emitPriceUpdate(message.asset_id, price, message.timestamp);
      }
    }
  }

  private handleBestBidAsk(message: WebSocketMessage): void {
    // This would contain best bid and best ask prices
    // For now, we'll rely on book updates
    logger.debug({ asset_id: message.asset_id }, '[PolymarketWS] Best bid/ask update');
  }

  private calculateMidPrice(
    buys: Array<{ price: string; size: string }>,
    sells: Array<{ price: string; size: string }>
  ): number {
    // Buys are bids (highest first), sells are asks (lowest first)
    const bestBid = buys.length > 0 ? parseFloat(buys[0].price) : 0;
    const bestAsk = sells.length > 0 ? parseFloat(sells[0].price) : 0;

    if (bestBid > 0 && bestAsk > 0) {
      return (bestBid + bestAsk) / 2;
    } else if (bestBid > 0) {
      return bestBid;
    } else if (bestAsk > 0) {
      return bestAsk;
    }

    return 0;
  }

  private emitPriceUpdate(tokenId: string, price: number, timestamp: number): void {
    const update: PriceUpdate = {
      tokenId,
      price,
      timestamp,
    };

    logger.debug(update, '[PolymarketWS] Price update');
    this.emit('price', update);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.isIntentionallyClosed) {
      return;
    }

    const delay = Math.min(
      this.reconnectInitialDelay * Math.pow(this.reconnectBackoffMultiplier, this.reconnectAttempts),
      this.reconnectMaxDelay
    );

    logger.info({
      attempt: this.reconnectAttempts + 1,
      delayMs: delay,
    }, '[PolymarketWS] Scheduling reconnection');

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.reconnectAttempts += 1;
      this.ws = undefined; // Clear old WebSocket instance
      this.connect();
    }, delay);
  }

  private startPingInterval(): void {
    this.stopPingInterval();
    // Send ping every 30 seconds to keep connection alive
    this.pingInterval = setInterval(() => {
      if (this.ws && this.isConnected) {
        this.ws.ping();
        logger.debug('[PolymarketWS] Sent ping');
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
