---
description: Search and browse Polymarket prediction markets. Use when the user wants to find markets to bet on.
allowed-tools: [Bash]
---

# Browse Markets

Search and browse Polymarket prediction markets.

## Search by Keyword

```bash
curl -X GET "https://heyvincent.ai/api/skills/polymarket/markets?query=bitcoin&limit=20" \
  -H "Authorization: Bearer <API_KEY>"
```

## Get All Active Markets

```bash
curl -X GET "https://heyvincent.ai/api/skills/polymarket/markets?active=true&limit=50" \
  -H "Authorization: Bearer <API_KEY>"
```

## Get Specific Market

```bash
curl -X GET "https://heyvincent.ai/api/skills/polymarket/market/<CONDITION_ID>" \
  -H "Authorization: Bearer <API_KEY>"
```

## Get Order Book

```bash
curl -X GET "https://heyvincent.ai/api/skills/polymarket/orderbook/<TOKEN_ID>" \
  -H "Authorization: Bearer <API_KEY>"
```

## Response Fields

- `question`: The market question
- `outcomes`: Array like `["Yes", "No"]`
- `outcomePrices`: Current prices for each outcome
- `tokenIds`: Array of token IDs for each outcome — **use these for placing bets**
- `acceptingOrders`: Whether the market is open for trading
- `closed`: Whether the market has resolved

## Important

- `tokenIds[0]` = first outcome token ID, `tokenIds[1]` = second outcome token ID
- Always use `tokenIds` from the market response when placing bets, NOT `conditionId`
- Check `acceptingOrders: true` before attempting to trade
