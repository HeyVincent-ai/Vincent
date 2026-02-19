# Trade Manager Skill

Use this skill when users ask to create, update, or inspect local stop-loss/take-profit/trailing-stop automation.

## Architecture

- Local daemon on each OpenClaw VPS
- Local API at `http://localhost:19000`
- Stores rules/events in local SQLite
- Executes trades through Vincent Polymarket API

## API endpoints

- `GET /health`
- `GET /status`
- `POST /api/rules`
- `GET /api/rules`
- `GET /api/rules/:id`
- `PATCH /api/rules/:id`
- `DELETE /api/rules/:id`
- `GET /api/positions`
- `GET /api/events?ruleId=<id>`

## Example prompts

- "Set a stop-loss at 0.42 for my YES position"
- "List my active trade manager rules"
- "Cancel my stop-loss for market X"
