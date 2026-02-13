---
description: Exchange a re-link token for a new API key. Use when the agent has lost its API key and the wallet owner provides a re-link token.
allowed-tools: [Bash]
---

# Re-link Wallet

Exchange a re-link token for a new scoped API key. Use this when you've lost your API key and the wallet owner gives you a re-link token.

## Usage

```bash
curl -X POST "https://heyvincent.ai/api/secrets/relink" \
  -H "Content-Type: application/json" \
  -d '{
    "relinkToken": "<TOKEN_FROM_USER>",
    "apiKeyName": "Re-linked API Key"
  }'
```

## Response

- `secret` — wallet metadata (id, type, address, chainId, etc.)
- `apiKey.key` — the new scoped API key to use as Bearer token

## Steps

1. Ask the user for the re-link token (they generate it from https://heyvincent.ai)
2. Call the endpoint above with their token
3. Store the returned API key in `~/.openclaw/credentials/agentwallet/<API_KEY_ID>.json` (OpenClaw) or `./agentwallet/<API_KEY_ID>.json` (standalone)
4. Use the new key for all subsequent requests

## Notes

- Re-link tokens are **one-time use** and expire after **10 minutes**
- No authentication is required on this endpoint — the token itself is the authorization
