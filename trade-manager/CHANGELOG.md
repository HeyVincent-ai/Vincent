# Changelog

All notable changes to the Trade Manager will be documented in this file.

## [Unreleased]

### Added

- **WebSocket Support for Real-Time Price Updates** - Major performance improvement
  - Integrated Polymarket WebSocket API (`wss://ws-subscriptions-clob.polymarket.com/ws/`)
  - Sub-second latency for price change detection (vs 15-60 seconds with polling)
  - Automatic subscription management based on active rules
  - Auto-reconnection with exponential backoff (1s → 60s max)
  - Hybrid approach: WebSocket for real-time + HTTP polling as fallback
  - New configuration options:
    - `enableWebSocket` (default: true)
    - `webSocketUrl`
    - `webSocketReconnectInitialDelay`
    - `webSocketReconnectMaxDelay`
  - Enhanced worker status with WebSocket metrics
  - Event source tracking in logs (`source: 'websocket'`)
  - Comprehensive documentation in [WEBSOCKET.md](./WEBSOCKET.md)
  - Unit tests for WebSocket service

### Changed

- **Reduced default polling interval from 15s to 60s** - WebSocket is now primary mechanism
- Worker status now includes WebSocket connection state and subscription count
- Price cache is now shared between WebSocket and polling mechanisms

### Dependencies

- Added `ws@^8.18.3` - WebSocket client library
- Added `@types/ws@^8.5.13` - TypeScript definitions for ws

## [0.1.0] - Initial Release

### Added

- Rule-based trade automation engine
- Support for STOP_LOSS, TAKE_PROFIT, TRAILING_STOP rule types
- REST API for rule management
- Position monitoring via Vincent API
- SQLite database for rule and position persistence
- HTTP polling for price updates (15s interval)
- Circuit breaker pattern for error handling
- Event logging for audit trail
- CLI for starting and managing the service
- Auto-migrations on startup
