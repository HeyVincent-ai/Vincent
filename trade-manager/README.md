# OpenClaw Trade Manager

Standalone service for automated stop-loss and take-profit rules against Polymarket positions.

## Installation

```bash
cd trade-manager
npm install
cp .env.example .env # optional
npm run db:generate
npm run db:deploy
npm run build
npm start
```

## Configuration

The app loads config from `~/.openclaw/trade-manager.json` first, then environment variables.

Required fields:

- `vincentApiUrl`
- `vincentApiKey`

Example:

```json
{
  "port": 19000,
  "pollIntervalSeconds": 15,
  "vincentApiUrl": "https://heyvincent.ai",
  "vincentApiKey": "<key>",
  "databaseUrl": "file:/root/.openclaw/trade-manager.db"
}
```

## API

- `GET /health`
- `GET /status`
- `POST /api/rules`
- `GET /api/rules`
- `GET /api/rules/:id`
- `PATCH /api/rules/:id`
- `DELETE /api/rules/:id`
- `GET /api/positions`
- `GET /api/events`

## Development

```bash
npm run dev
npm test
```

## Systemd

Install user service:

```bash
./scripts/install-systemd.sh
systemctl --user status openclaw-trade-manager
journalctl --user -u openclaw-trade-manager -f
```
