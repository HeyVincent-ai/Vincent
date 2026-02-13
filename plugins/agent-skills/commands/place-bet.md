---
description: Place a buy or sell order on a Polymarket prediction market. Use when the user wants to bet on an outcome.
allowed-tools: [Bash]
---

# Place Bet

Place a buy or sell order on a Polymarket prediction market.

## Usage

```bash
curl -X POST "https://heyvincent.ai/api/skills/polymarket/bet" \
  -H "Authorization: Bearer <API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "tokenId": "<OUTCOME_TOKEN_ID>",
    "side": "BUY",
    "amount": 5,
    "price": 0.55
  }'
```

## Parameters

- `tokenId`: The outcome token ID from market data (use `/vincent:browse-markets` to find it)
- `side`: `"BUY"` or `"SELL"`
- `amount`: For BUY — USD amount to spend. For SELL — number of shares to sell.
- `price`: Limit price (0.01 to 0.99). Optional — omit for market order.

## BUY Orders

- `amount` is the USD you want to spend (e.g., `5` = $5)
- You receive `amount / price` shares (e.g., $5 at 0.50 = 10 shares)
- Minimum order is $1

## SELL Orders

- `amount` is the number of shares to sell
- You receive `amount * price` USD
- Must own the shares first (from a previous BUY)
- After a BUY fills, wait a few seconds before selling — shares need time to settle on-chain

## Error Handling

- If rejected by a policy, tell the user to check settings at https://heyvincent.ai.
- If `status: "pending_approval"`, the wallet owner will be notified via Telegram.
- `"No orderbook exists for the requested token id"` — market is closed or you're using `conditionId` instead of `tokenId`.
