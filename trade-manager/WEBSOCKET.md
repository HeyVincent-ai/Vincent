# WebSocket Integration

The Trade Manager now supports real-time price updates via the Polymarket WebSocket API, enabling sub-second reaction times to price changes.

## Overview

Instead of polling the HTTP API every 15-60 seconds, the Trade Manager can now:
- Connect to Polymarket's WebSocket endpoint
- Subscribe to real-time orderbook updates for active rules
- Evaluate rules immediately when prices change (<1 second latency)
- Fallback to HTTP polling if WebSocket is unavailable

## Configuration

WebSocket support is **enabled by default**. You can configure it in `~/.openclaw/trade-manager.json`:

```json
{
  "enableWebSocket": true,
  "webSocketUrl": "wss://ws-subscriptions-clob.polymarket.com/ws/market",
  "webSocketReconnectInitialDelay": 1000,
  "webSocketReconnectMaxDelay": 60000,
  "pollIntervalSeconds": 60
}
```

### Configuration Options

- **`enableWebSocket`** (default: `true`): Enable/disable WebSocket support
- **`webSocketUrl`** (default: `wss://ws-subscriptions-clob.polymarket.com/ws/market`): WebSocket endpoint URL (use `/ws/market` for market data)
- **`webSocketReconnectInitialDelay`** (default: `1000`): Initial reconnection delay in milliseconds
- **`webSocketReconnectMaxDelay`** (default: `60000`): Maximum reconnection delay in milliseconds
- **`pollIntervalSeconds`** (default: `60`): HTTP polling interval as fallback (reduced from 15s)

### Environment Variables

You can also configure via environment variables:

```bash
export ENABLE_WEBSOCKET=true
export WEBSOCKET_URL=wss://ws-subscriptions-clob.polymarket.com/ws/
export POLL_INTERVAL_SECONDS=60
```

## How It Works

### 1. Connection Management

- WebSocket connects automatically when the worker starts
- Auto-reconnects with exponential backoff (1s → 2s → 4s → ... → 60s max)
- Automatically resubscribes to all tokens after reconnection
- Ping/pong heartbeat keeps connection alive

### 2. Subscription Management

- The worker automatically subscribes to token IDs from active rules
- Subscriptions are synchronized on each polling tick
- Tokens are unsubscribed when rules are deactivated
- No authentication required for market data (orderbook/prices)

### 3. Real-Time Rule Evaluation

When a price update is received:
1. Price cache is updated immediately
2. All rules for that token ID are evaluated
3. Matching rules trigger actions (place order, close position, etc.)
4. Event is logged with `source: 'websocket'` for tracking

### 4. Hybrid Approach

The system uses both WebSocket AND polling:
- **WebSocket**: Primary mechanism for real-time price updates
- **HTTP Polling**: Fallback mechanism + periodic sync (every 60s by default)
  - Updates positions from Vincent API
  - Syncs WebSocket subscriptions with active rules
  - Fetches prices for tokens without WebSocket updates

## Message Types

The WebSocket service handles these message types from Polymarket:

- **`book`**: Full orderbook snapshot with bid/ask levels
- **`price_change`**: Notification that orders were placed/cancelled
- **`last_trade_price`**: Price from executed trades
- **`best_bid_ask`**: Best bid and best ask prices (feature-flagged)

Prices are calculated as the mid-price: `(best_bid + best_ask) / 2`

## Monitoring

### Worker Status

The worker status now includes WebSocket metrics:

```bash
curl http://localhost:19000/api/health/worker
```

Response:
```json
{
  "running": true,
  "activeRulesCount": 5,
  "webSocketConnected": true,
  "webSocketSubscriptions": 5,
  "lastSyncTime": "2026-02-17T10:30:45.123Z",
  "consecutiveFailures": 0
}
```

### Logging

WebSocket events are logged with structured metadata:

```
[PolymarketWS] Connected successfully
[PolymarketWS] Resubscribing to tokens { count: 5 }
[PolymarketWS] Price update { tokenId: '0x123...', price: 0.67, timestamp: 1708167045123 }
[MonitoringWorker] Rule triggered by WebSocket price update { ruleId: 'rule_123', tokenId: '0x123...', price: 0.67 }
```

Set `LOG_LEVEL=debug` to see detailed WebSocket messages.

## Performance Benefits

Compared to HTTP polling (15s interval):

| Metric | HTTP Polling | WebSocket |
|--------|-------------|-----------|
| **Latency** | 0-15 seconds | <1 second |
| **API Calls** | ~240/hour | ~4/hour |
| **Accuracy** | Interpolated | Real-time |
| **Network** | High | Low |

## Disabling WebSocket

To disable WebSocket and use HTTP-only polling:

```json
{
  "enableWebSocket": false,
  "pollIntervalSeconds": 15
}
```

Or via environment variable:

```bash
export ENABLE_WEBSOCKET=false
export POLL_INTERVAL_SECONDS=15
```

## Troubleshooting

### WebSocket Not Connecting

1. Check firewall/proxy settings (requires outbound WebSocket on port 443)
2. Verify URL: `wss://ws-subscriptions-clob.polymarket.com/ws/`
3. Check logs for connection errors
4. Ensure your network allows WebSocket (WSS) traffic

### Frequent Reconnections

- Check network stability
- Review reconnection delays in config
- Ensure proper cleanup on shutdown

### Missing Price Updates

- Verify token IDs are correct (must match Polymarket's token IDs)
- Check that rules are ACTIVE status
- Review logs for WebSocket subscription confirmations
- Confirm orderbook has liquidity (no prices if empty orderbook)

## Architecture

```
┌─────────────────────────────────────────┐
│         MonitoringWorker                 │
│  ┌────────────┐      ┌────────────┐    │
│  │  HTTP Poll │      │  WebSocket │    │
│  │  (60s)     │      │  (real-time)│   │
│  └─────┬──────┘      └──────┬─────┘    │
│        │                    │           │
│        └────────┬───────────┘           │
│                 ▼                        │
│         ┌──────────────┐                │
│         │ Price Cache  │                │
│         └──────┬───────┘                │
│                ▼                         │
│         ┌──────────────┐                │
│         │ Rule Engine  │                │
│         └──────────────┘                │
└─────────────────────────────────────────┘
```

## References

- [Polymarket WebSocket Documentation](https://docs.polymarket.com/developers/CLOB/websocket/wss-overview)
- [Market Channel Details](https://docs.polymarket.com/developers/CLOB/websocket/market-channel)
- Implementation: `src/services/polymarketWebSocket.service.ts`
