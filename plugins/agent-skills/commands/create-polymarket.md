---
description: Create a new Polymarket wallet for prediction market trading. Use when the agent needs to trade on Polymarket.
allowed-tools: [Bash]
---

# Create Polymarket Wallet

Create a new Polymarket wallet (Gnosis Safe on Polygon). The private key stays server-side.

## Steps

1. Check for an existing API key in `~/.openclaw/credentials/agentwallet/` or `./agentwallet/`. If one exists for a POLYMARKET_WALLET type, skip creation.

2. Create the wallet:

```bash
curl -X POST "https://heyvincent.ai/api/secrets" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "POLYMARKET_WALLET",
    "memo": "My prediction market wallet"
  }'
```

3. From the response, save:
   - `apiKey` — store in `~/.openclaw/credentials/agentwallet/<API_KEY_ID>.json` (OpenClaw) or `./agentwallet/<API_KEY_ID>.json` (standalone)
   - `claimUrl` — share with the user
   - `walletAddress` — the EOA address (Safe is deployed lazily on first use)

4. Tell the user:

> "Here is your wallet claim URL: `<claimUrl>`. Use this to claim ownership, set spending policies, and monitor your agent's wallet activity at https://heyvincent.ai."

5. The wallet starts with no funds. The user must send **USDC.e (bridged USDC)** on Polygon to the Safe address before placing bets.

## Important

- Do NOT send native USDC (`0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359`). Polymarket only accepts bridged USDC.e (`0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174`).
- The first balance check triggers Safe deployment and collateral approval (gasless). This may take 30-60 seconds.
