import type { TradeRuleType, TradeRuleStatus, TradeRuleEventType } from '@prisma/client';

export type { TradeRuleType, TradeRuleStatus, TradeRuleEventType };

export interface RuleLike {
  id: string;
  secretId: string;
  ruleType: TradeRuleType;
  marketId: string;
  tokenId: string;
  side: string;
  triggerPrice: number;
  trailingPercent: number | null;
  action: string;
  status: TradeRuleStatus;
}

export interface WorkerStatus {
  running: boolean;
  activeRulesCount: number;
  lastSyncTime?: string;
  consecutiveFailures: number;
  circuitBreakerUntil?: string;
  webSocketConnected: boolean;
  webSocketSubscriptions: number;
}

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
  event_type:
    | 'book'
    | 'price_change'
    | 'last_trade_price'
    | 'best_bid_ask'
    | 'tick_size_change'
    | 'new_market'
    | 'market_resolved';
  asset_id: string;
  market?: string;
  timestamp: number;
  hash?: string;
  price?: string;
  buys?: Array<{ price: string; size: string }>;
  sells?: Array<{ price: string; size: string }>;
}
