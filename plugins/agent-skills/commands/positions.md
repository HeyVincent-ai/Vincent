---
description: View open orders and trade history on Polymarket. Use to check current positions.
allowed-tools: [Bash]
---

# View Positions

Check open orders and trade history on Polymarket.

## Get Open Orders

```bash
curl -X GET "https://heyvincent.ai/api/skills/polymarket/positions" \
  -H "Authorization: Bearer <API_KEY>"
```

## Get Trade History

```bash
curl -X GET "https://heyvincent.ai/api/skills/polymarket/trades" \
  -H "Authorization: Bearer <API_KEY>"
```
