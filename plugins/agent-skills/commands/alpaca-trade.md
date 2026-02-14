---
description: Submit a stock trade intent via Alpaca through Vincent. Use when the user wants to buy or sell equities.
allowed-tools: [Bash]
---

# Alpaca Trade

Submit a stock trade intent to Vincent, which enforces user-configured guardrails and then places the order via Alpaca.

## Usage

```bash
curl -X POST "https://heyvincent.ai/api/trading/alpaca/intents" \
  -H "Authorization: Bearer <API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "AAPL",
    "side": "buy",
    "qty": 2,
    "orderType": "limit",
    "limitPrice": 185.25,
    "timeInForce": "day",
    "idempotencyKey": "aapl-buy-2026-02-14-1"
  }'
```

## Parameters

- `symbol`: Stock ticker symbol (e.g. `AAPL`)
- `side`: `"buy"` or `"sell"`
- `qty`: Share quantity (use `qty` or `notionalUsd`, not both)
- `notionalUsd`: USD amount (market orders only, must use `timeInForce: "day"`)
- `orderType`: `"market"` or `"limit"`
- `limitPrice`: Required for limit orders
- `timeInForce`: Optional. One of `"day"`, `"gtc"`, `"opg"`, `"cls"`, `"ioc"`, `"fok"`. Defaults to `"day"`.
- `idempotencyKey`: Optional. Prevents duplicate orders if retried.
- `connectionId`: Optional. Use a specific Alpaca connection if multiple are configured.

## Guardrails

- If the order is rejected, tell the user to review policies in Vincent settings.
- Policies are optional. If configured, they are enforced before the order is submitted.
