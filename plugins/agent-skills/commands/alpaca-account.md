---
description: Fetch Alpaca account balances (cash, buying power, equity, portfolio values) via Vincent.
allowed-tools: [Bash]
---

# Alpaca Account

Fetch the user's Alpaca account balances through Vincent. Useful before placing trades or when asked for current account status.

## Usage

```bash
curl -X GET "https://heyvincent.ai/api/trading/alpaca/account" \
  -H "Authorization: Bearer <API_KEY>"
```

## Optional parameters

- `connectionId`: Use a specific Alpaca connection if multiple are configured.

```bash
curl -X GET "https://heyvincent.ai/api/trading/alpaca/account?connectionId=<CONNECTION_ID>" \
  -H "Authorization: Bearer <API_KEY>"
```

## Returned fields (account)

- `cash`: Actual settled USD cash
- `buying_power`: Amount available to trade
- `equity`: Total account value
- `portfolio_value`: Portfolio value
- `long_market_value`: Value of long positions
- `short_market_value`: Value of short positions
