# Trade Manager

Automated rule-based trading system for Polymarket with real-time WebSocket price updates.

## Features

- 🚀 **Real-time price updates** via WebSocket (sub-second latency)
- 📊 **Web dashboard** for monitoring rules and events  
- 🔄 **Rule types**: Stop Loss, Take Profit, Trailing Stop
- 🔌 **Auto-reconnection** with exponential backoff
- 📝 **Event logging** for audit trail
- 🛡️ **Circuit breaker** pattern for error handling
- 💾 **SQLite** database with auto-migrations

## Quick Start

```bash
npm install -g @openclaw/trade-manager
trade-manager start
```

**Web Dashboard**: Open http://localhost:19000 in your browser

## Documentation

- [WebSocket Integration](./WEBSOCKET.md) - Real-time price updates
- [Testing Guide](./TESTING.md) - Local testing and development
- [Changelog](./CHANGELOG.md) - Version history

## License

MIT
