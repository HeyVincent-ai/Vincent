---
description: Cancel one or all open Polymarket orders. Use when the user wants to cancel pending bets.
allowed-tools: [Bash]
---

# Cancel Orders

Cancel open orders on Polymarket.

## Cancel a Specific Order

```bash
curl -X DELETE "https://heyvincent.ai/api/skills/polymarket/orders/<ORDER_ID>" \
  -H "Authorization: Bearer <API_KEY>"
```

## Cancel All Open Orders

```bash
curl -X DELETE "https://heyvincent.ai/api/skills/polymarket/orders" \
  -H "Authorization: Bearer <API_KEY>"
```
