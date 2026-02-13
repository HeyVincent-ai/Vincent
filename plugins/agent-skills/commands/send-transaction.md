---
description: Send an arbitrary transaction with custom calldata to any smart contract. For advanced contract interactions.
allowed-tools: [Bash]
---

# Send Transaction

Interact with any smart contract by sending custom calldata.

## Usage

```bash
curl -X POST "https://heyvincent.ai/api/skills/evm-wallet/send-transaction" \
  -H "Authorization: Bearer <API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "0xContractAddress",
    "data": "0xCalldata",
    "value": "0"
  }'
```

## Parameters

- `to`: Target contract address
- `data`: ABI-encoded calldata (hex string starting with `0x`)
- `value`: Optional. Native ETH value to send with the transaction (in wei as string). Default: `"0"`.

## Notes

- Use this for contract interactions that aren't covered by transfer or swap commands.
- Policy enforcement still applies — address allowlists, function allowlists (by 4-byte selector), and spending limits are checked server-side.
