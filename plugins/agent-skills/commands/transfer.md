---
description: Transfer ETH or ERC-20 tokens to an address. Use when the user wants to send crypto.
allowed-tools: [Bash]
---

# Transfer Tokens

Send native ETH or ERC-20 tokens to a recipient address.

## Transfer Native ETH

```bash
curl -X POST "https://heyvincent.ai/api/skills/evm-wallet/transfer" \
  -H "Authorization: Bearer <API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "0xRecipientAddress",
    "amount": "0.01"
  }'
```

## Transfer ERC-20 Token

```bash
curl -X POST "https://heyvincent.ai/api/skills/evm-wallet/transfer" \
  -H "Authorization: Bearer <API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "0xRecipientAddress",
    "amount": "100",
    "token": "0xTokenContractAddress"
  }'
```

## Parameters

- `to`: Recipient wallet address
- `amount`: Human-readable amount (e.g., `"0.01"` for 0.01 ETH)
- `token`: Optional. ERC-20 contract address. Omit for native ETH.

## Error Handling

- If rejected by a policy, the response explains which policy was triggered. Tell the user to check settings at https://heyvincent.ai.
- If `status: "pending_approval"`, the wallet owner will receive a Telegram notification to approve or deny.
