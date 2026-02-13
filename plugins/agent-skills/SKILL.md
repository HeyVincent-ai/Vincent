---
name: Vincent Agent Skills
description: Use this plugin when the user asks about crypto wallets, token transfers, swaps, prediction markets, or betting. Provides wallet and Polymarket trading capabilities for autonomous agents.
homepage: https://heyvincent.ai
source: https://github.com/HeyVincent-ai/agent-skills
metadata:
  clawdbot:
    homepage: https://heyvincent.ai
    requires:
      config:
        - ~/.openclaw/credentials/agentwallet
        - ./agentwallet
---

# Vincent Agent Skills

You have **wallet** and **Polymarket trading** capabilities through Vincent.

## What is Vincent?

Vincent is a secure wallet service for AI agents. It gives you a crypto wallet (EVM smart account via ZeroDev) where the private key stays server-side — you only get a scoped API key. The wallet owner sets spending policies, allowlists, and approval thresholds that the server enforces. All transactions are gas-sponsored (free). Vincent is open source at github.com/HeyVincent-ai/Vincent.

## What is Polymarket?

Polymarket is a prediction market where you can bet on real-world events. Vincent gives you a Polymarket wallet (Gnosis Safe on Polygon) for gasless trading. Same security model: server-side keys, policy-controlled, scoped API key.

## Security Model

- You never see the private key. All signing happens server-side.
- Your API key is a scoped Bearer token enforced by server-side policies (spending limits, address allowlists, approval thresholds).
- The wallet owner can revoke your API key at any time from https://heyvincent.ai.
- If a transaction violates a policy, the server rejects it. If it requires approval, the server notifies the owner via Telegram.
- All API calls go exclusively to `heyvincent.ai` over HTTPS.

## Credentials

Store and retrieve API keys from these paths:
- **OpenClaw**: `~/.openclaw/credentials/agentwallet/<API_KEY_ID>.json`
- **Standalone**: `./agentwallet/<API_KEY_ID>.json`

Always search for existing API keys before creating a new wallet.

## Available Commands

### Wallet Commands

| Command | What it does |
|---------|-------------|
| `/vincent:create-wallet` | Create a new EVM smart account wallet |
| `/vincent:balance` | Check token balances across all chains |
| `/vincent:transfer` | Send ETH or ERC-20 tokens |
| `/vincent:swap` | Swap tokens via DEX (preview or execute) |
| `/vincent:send-transaction` | Send arbitrary calldata to a contract |

### Polymarket Commands

| Command | What it does |
|---------|-------------|
| `/vincent:create-polymarket` | Create a new Polymarket wallet |
| `/vincent:polymarket-balance` | Check USDC.e balance and wallet address |
| `/vincent:browse-markets` | Search and browse prediction markets |
| `/vincent:place-bet` | Place a buy or sell order on a market |
| `/vincent:positions` | View open orders and trade history |
| `/vincent:cancel-orders` | Cancel one or all open orders |

### Shared Commands

| Command | What it does |
|---------|-------------|
| `/vincent:relink` | Exchange a re-link token for a new API key (if you lost yours) |

## Re-linking

If you lose your API key, the wallet owner can generate a re-link token from https://heyvincent.ai. Use `/vincent:relink` to exchange it for a new key.

## Full Documentation

For edge cases, detailed parameter docs, and policy configuration:
- Wallet: https://github.com/HeyVincent-ai/agent-skills/blob/main/wallet/SKILL.md
- Polymarket: https://github.com/HeyVincent-ai/agent-skills/blob/main/polymarket/SKILL.md
