---
description: Check wallet token balances across all supported EVM chains. Shows ETH, ERC-20 tokens, and USD values.
allowed-tools: [Bash]
---

# Check Balance

Get all token balances for your wallet across supported chains.

## Usage

```bash
# All balances across all chains
curl -X GET "https://heyvincent.ai/api/skills/evm-wallet/balances" \
  -H "Authorization: Bearer <API_KEY>"

# Filter to specific chains (comma-separated chain IDs)
curl -X GET "https://heyvincent.ai/api/skills/evm-wallet/balances?chainIds=1,137,42161" \
  -H "Authorization: Bearer <API_KEY>"
```

## Response

Returns all ERC-20 tokens and native balances with symbols, decimals, logos, and USD values.

## Get Wallet Address

```bash
curl -X GET "https://heyvincent.ai/api/skills/evm-wallet/address" \
  -H "Authorization: Bearer <API_KEY>"
```
