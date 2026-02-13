---
description: Swap one token for another using DEX liquidity. Supports preview (no execution) and execute modes.
allowed-tools: [Bash]
---

# Swap Tokens

Swap one token for another using DEX liquidity (powered by 0x).

## Preview a Swap (no execution)

```bash
curl -X POST "https://heyvincent.ai/api/skills/evm-wallet/swap/preview" \
  -H "Authorization: Bearer <API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "sellToken": "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
    "buyToken": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    "sellAmount": "0.1",
    "chainId": 1
  }'
```

## Execute a Swap

```bash
curl -X POST "https://heyvincent.ai/api/skills/evm-wallet/swap/execute" \
  -H "Authorization: Bearer <API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "sellToken": "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
    "buyToken": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    "sellAmount": "0.1",
    "chainId": 1,
    "slippageBps": 100
  }'
```

## Parameters

- `sellToken` / `buyToken`: Token contract addresses. Use `0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE` for native ETH.
- `sellAmount`: Human-readable amount to sell (e.g., `"0.1"` for 0.1 ETH).
- `chainId`: Chain to swap on. `1` = Ethereum, `137` = Polygon, `42161` = Arbitrum, `10` = Optimism, `8453` = Base.
- `slippageBps`: Optional slippage tolerance in basis points (`100` = 1%). Default: 100.

## Notes

- Preview returns expected buy amount, route info, and fees without executing.
- Execute handles ERC20 approvals automatically.
- Always preview first if the user wants to see pricing before committing.
