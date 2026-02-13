---
description: Check Polymarket wallet balance and get the wallet address. Use before placing bets to verify funds.
allowed-tools: [Bash]
---

# Polymarket Balance

Check USDC.e balance and get the Safe wallet address.

## Usage

```bash
curl -X GET "https://heyvincent.ai/api/skills/polymarket/balance" \
  -H "Authorization: Bearer <API_KEY>"
```

## Response

- `walletAddress` — the Safe address (deployed on first call if needed)
- `collateral.balance` — USDC.e balance available for trading
- `collateral.allowance` — approved amount for Polymarket contracts

## Notes

- The first call triggers Safe deployment and collateral approval (gasless via relayer). This may take 30-60 seconds.
- Give the `walletAddress` to the user so they can fund it with USDC.e on Polygon.
- Minimum $1 required per bet (Polymarket minimum).
