---
description: Create a new EVM smart account wallet for the agent. Use when the agent needs a wallet for transfers, swaps, or contract interactions.
allowed-tools: [Bash]
---

# Create Wallet

Create a new EVM smart account wallet. The private key stays server-side — you receive a scoped API key.

## Steps

1. Check for an existing API key in `~/.openclaw/credentials/agentwallet/` or `./agentwallet/`. If one exists, skip creation.

2. Create the wallet:

```bash
curl -X POST "https://heyvincent.ai/api/secrets" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "EVM_WALLET",
    "memo": "My agent wallet",
    "chainId": 84532
  }'
```

- `type`: `EVM_WALLET` for smart account (gas-sponsored), or `RAW_SIGNER` for raw signing (you pay gas).
- `chainId`: Optional. Default chain for operations. Common: `1` (Ethereum), `137` (Polygon), `42161` (Arbitrum), `8453` (Base), `84532` (Base Sepolia testnet).

3. From the response, save:
   - `apiKey` — store in `~/.openclaw/credentials/agentwallet/<API_KEY_ID>.json` (OpenClaw) or `./agentwallet/<API_KEY_ID>.json` (standalone)
   - `claimUrl` — share with the user
   - `address` — the smart account address

4. Tell the user:

> "Here is your wallet claim URL: `<claimUrl>`. Use this to claim ownership, set spending policies, and monitor your agent's wallet activity at https://heyvincent.ai."

## Notes

- No gas needed — all transaction fees are sponsored automatically.
- Before the wallet is claimed, the agent can operate without policy restrictions.
- Once claimed, the owner configures policies (spending limits, allowlists, approval thresholds).
