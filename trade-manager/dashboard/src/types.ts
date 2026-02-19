export type WorkerStatus = {
  running: boolean;
  webSocketConnected: boolean;
  activeRulesCount: number;
  webSocketSubscriptions: number;
  lastSyncTime?: string | null;
};

export type Rule = {
  id: string;
  ruleType: string;
  marketId: string;
  marketSlug?: string | null;
  tokenId: string;
  side: string;
  triggerPrice: number;
  trailingPercent?: number | null;
  action: string;
  status: string;
  errorMessage?: string | null;
  createdAt: string;
};

export type Position = {
  id: string;
  marketId: string;
  marketSlug?: string | null;
  marketTitle?: string | null;
  outcome?: string | null;
  tokenId: string;
  side: string;
  quantity: number;
  avgEntryPrice?: number | null;
  currentPrice: number;
  lastUpdatedAt: string;
};

export type Trade = {
  id: string;
  timestamp: string;
  ruleType: string;
  marketId: string;
  marketSlug?: string | null;
  side: string;
  tradeSide: string;
  triggerPrice: number;
  amount?: number | null;
  price?: number | null;
  txHash?: string | null;
  orderId?: string | null;
  status?: string;
};

export type RuleEvent = {
  id: string;
  ruleId: string;
  eventType: string;
  data: Record<string, unknown>;
  createdAt: string;
};
