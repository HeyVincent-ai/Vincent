# Skill Separation: `@vincentai/cli` NPM Package

## Problem

The 5 SKILL.md files total ~1,600 lines and embed verbose curl commands inline. This is:
- **Too long for smaller AI models** — they lose context or truncate
- **Repetitive** — every skill duplicates auth headers, base URLs, error patterns
- **Fragile key management** — each skill has ~20 lines explaining where/how to store and retrieve API keys, with branching logic for OpenClaw vs non-OpenClaw environments

## Solution

Publish a `@vincentai/cli` npm package that agents use via `npx @vincentai/cli@latest <command>`. The CLI:

1. **Replaces all curl commands** with simple CLI calls
2. **Handles API key storage/retrieval automatically** — agents never deal with file paths
3. **Uses key IDs instead of raw keys** on the command line — the CLI resolves the actual key internally
4. **Always up-to-date** via `@latest` — no version pinning needed in SKILL.md

This eliminates ALL key management prose from SKILL.md files and replaces multi-line curl blocks with one-liners.

## Architecture

### Package Location

New directory `cli/` at the project root with its own `package.json` (`@vincentai/cli`), `tsconfig.json`, and build pipeline.

```
cli/
├── package.json              # name: "@vincentai/cli", bin: { "vincent": "./dist/index.js" }
├── tsconfig.json
├── src/
│   ├── index.ts              # Entry point — command router
│   ├── lib/
│   │   ├── client.ts         # HTTP client (Node built-in fetch)
│   │   ├── keystore.ts       # API key storage/retrieval by ID
│   │   ├── args.ts           # CLI argument parser
│   │   └── types.ts          # Shared types
│   └── commands/
│       ├── secret/
│       │   ├── create.ts     # Create secret + auto-store key
│       │   ├── relink.ts     # Exchange relink token + auto-store key
│       │   └── list.ts       # List stored key IDs
│       ├── wallet/
│       │   ├── address.ts
│       │   ├── balances.ts
│       │   ├── transfer.ts
│       │   ├── swap.ts       # preview + execute subcommands
│       │   ├── send-tx.ts
│       │   └── transfer-between.ts  # preview + execute + status
│       ├── raw-signer/
│       │   ├── addresses.ts
│       │   └── sign.ts
│       ├── polymarket/
│       │   ├── balance.ts
│       │   ├── markets.ts
│       │   ├── market.ts
│       │   ├── orderbook.ts
│       │   ├── bet.ts
│       │   ├── holdings.ts
│       │   ├── open-orders.ts
│       │   ├── trades.ts
│       │   ├── cancel-order.ts
│       │   ├── cancel-all.ts
│       │   └── redeem.ts
│       ├── twitter/
│       │   ├── search.ts
│       │   ├── tweet.ts
│       │   ├── user.ts
│       │   └── user-tweets.ts
│       ├── brave/
│       │   ├── web.ts
│       │   └── news.ts
│       └── trade-manager/
│           ├── health.ts
│           ├── status.ts
│           ├── create-rule.ts
│           ├── list-rules.ts
│           ├── update-rule.ts
│           ├── delete-rule.ts
│           ├── positions.ts
│           └── events.ts
```

### Key Management (`lib/keystore.ts`)

The CLI manages API keys automatically. Agents never touch credential files directly.

**Storage paths:**
```
${OPENCLAW_STATE_DIR:-$HOME/.openclaw}/credentials/
├── agentwallet/              # EVM_WALLET, POLYMARKET_WALLET, RAW_SIGNER
│   └── <key-id>.json
└── datasources/              # DATA_SOURCES
    └── <key-id>.json
```

**Key file format (`<key-id>.json`):**
```json
{
  "id": "clxyz123",
  "apiKey": "sk_live_...",
  "type": "EVM_WALLET",
  "memo": "My agent wallet",
  "secretId": "sec_abc",
  "createdAt": "2025-02-16T12:00:00.000Z"
}
```

**Keystore functions:**
- `storeKey(keyData)` — writes key file to the correct directory based on `type`
- `getKey(keyId)` — searches both credential directories, returns the API key string
- `listKeys(type?)` — lists all stored key IDs with type and memo
- `findKey(type)` — returns the single key of that type (errors if >1 found, for auto-discovery)

**Type-to-directory mapping:**
| Secret Type | Directory |
|---|---|
| `EVM_WALLET` | `credentials/agentwallet/` |
| `POLYMARKET_WALLET` | `credentials/agentwallet/` |
| `RAW_SIGNER` | `credentials/agentwallet/` |
| `DATA_SOURCES` | `credentials/datasources/` |

### Command Design

**Pattern:** `npx @vincentai/cli@latest <group> <command> [--key-id <id>] [options]`

**Conventions:**
- `--key-id <id>` — resolves to stored API key (required for authenticated commands)
- If `--key-id` is omitted and there's exactly one key of the right type, auto-discover it
- All output is JSON to stdout
- Errors go to stderr with non-zero exit code
- `--help` on any command shows usage

**Example usage:**
```bash
# Create a wallet — CLI stores key automatically, prints key-id + claim URL
npx @vincentai/cli@latest secret create --type EVM_WALLET --memo "My wallet"
# Output: { "keyId": "clxyz123", "claimUrl": "https://...", "address": "0x..." }

# Use the key-id for all subsequent commands
npx @vincentai/cli@latest wallet balances --key-id clxyz123
npx @vincentai/cli@latest wallet transfer --key-id clxyz123 --to 0x... --amount 0.01

# List stored keys
npx @vincentai/cli@latest secret list
# Output: [{ "id": "clxyz123", "type": "EVM_WALLET", "memo": "My wallet" }, ...]

# Relink — CLI stores new key automatically
npx @vincentai/cli@latest secret relink --token <TOKEN_FROM_USER>
```

### HTTP Client (`lib/client.ts`)

Thin wrapper around Node's built-in `fetch`:
- `vincentGet(path, apiKey, params?)` → JSON
- `vincentPost(path, apiKey, body?)` → JSON
- `vincentDelete(path, apiKey)` → JSON
- `vincentPatch(path, apiKey, body)` → JSON
- Base URL: `https://heyvincent.ai` (overridable via `--base-url` or `VINCENT_BASE_URL` env var)
- Trade Manager commands use `http://localhost:19000` as base URL

### Build & Publish

**Build:** TypeScript → JavaScript via `tsc`. Output to `cli/dist/`.

**package.json:**
```json
{
  "name": "@vincentai/cli",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "vincent": "./dist/index.js"
  },
  "files": ["dist"],
  "engines": { "node": ">=20.0.0" }
}
```

**Publish:** `npm publish --access public` from `cli/`. Can be part of the existing `publish_skill.sh` or a separate step.

**No runtime dependencies.** The CLI uses only Node.js built-ins (`fetch`, `fs`, `path`, `os`). Zero npm dependencies = fast npx startup.

### SKILL.md Transformation

**What gets removed:**
- All "Configuration" sections explaining Bearer tokens and where to store keys
- All "If you're an OpenClaw instance, store in X. Otherwise, store in Y" branching
- All "Always search for existing API keys in the declared config paths" notes
- All inline curl commands with headers and JSON bodies

**What stays:**
- Frontmatter metadata (still declares config paths for host auditing)
- Security model prose
- Pricing tables
- Policy descriptions
- Important behavioral notes (e.g., "wait after BUY before selling")

**Before → After example (wallet create + transfer):**

Before (~30 lines):
```markdown
### 1. Create a Wallet

Create a new smart account wallet for your agent...

\`\`\`bash
curl -X POST "https://heyvincent.ai/api/secrets" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "EVM_WALLET",
    "memo": "My agent wallet",
    "chainId": 84532
  }'
\`\`\`

Response includes:
- `apiKey` -- a scoped API key; store this securely and use it as the Bearer token
- `claimUrl` -- share this with the user

After creating, tell the user:
> "Here is your wallet claim URL: ..."

### 4. Transfer ETH or Tokens

\`\`\`bash
curl -X POST "https://heyvincent.ai/api/skills/evm-wallet/transfer" \
  -H "Authorization: Bearer <API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{ "to": "0xRecipientAddress", "amount": "0.01" }'
\`\`\`
```

After (~10 lines):
```markdown
### 1. Create a Wallet

\`\`\`bash
npx @vincentai/cli@latest secret create --type EVM_WALLET --memo "My agent wallet" --chain-id 84532
\`\`\`

Returns `keyId` (use for all future commands) and `claimUrl` (share with the user).

### 4. Transfer ETH or Tokens

\`\`\`bash
npx @vincentai/cli@latest wallet transfer --key-id <KEY_ID> --to 0xRecipient --amount 0.01
# ERC-20: add --token 0xTokenAddress
\`\`\`
```

**Actual line reduction:**
| Skill | Before | After | Reduction |
|-------|--------|-------|-----------|
| wallet | 357 | 253 | 29% |
| polymarket | 487 | 345 | 29% |
| trade-manager | 421 | 287 | 32% |
| twitter | 178 | 153 | 14% |
| brave-search | 162 | 141 | 13% |
| **Total** | **1,605** | **1,179** | **26%** |

The reduction is smaller than originally estimated because security model prose, policies, and behavioral notes (which are intentionally preserved) account for most of the content. The curl→CLI replacement and key management prose removal are significant but represent a smaller fraction than anticipated.

### Command Reference (All Commands)

```
secret create    --type <TYPE> --memo <MEMO> [--chain-id <ID>]
secret relink    --token <TOKEN>
secret list      [--type <TYPE>]

wallet address              --key-id <ID>
wallet balances             --key-id <ID> [--chain-ids <IDS>]
wallet transfer             --key-id <ID> --to <ADDR> --amount <AMT> [--token <ADDR>]
wallet swap preview         --key-id <ID> --sell-token <ADDR> --buy-token <ADDR> --sell-amount <AMT> --chain-id <ID>
wallet swap execute         --key-id <ID> --sell-token <ADDR> --buy-token <ADDR> --sell-amount <AMT> --chain-id <ID> [--slippage <BPS>]
wallet send-tx              --key-id <ID> --to <ADDR> --data <HEX> [--value <AMT>]
wallet transfer-between preview  --key-id <ID> --to-secret-id <ID> --from-chain <ID> --to-chain <ID> --token-in <T> --amount <AMT> --token-out <T> [--slippage <BPS>]
wallet transfer-between execute  --key-id <ID> --to-secret-id <ID> --from-chain <ID> --to-chain <ID> --token-in <T> --amount <AMT> --token-out <T> [--slippage <BPS>]
wallet transfer-between status   --key-id <ID> --relay-id <ID>

raw-signer addresses  --key-id <ID>
raw-signer sign       --key-id <ID> --message <HEX> --curve <ethereum|solana>

polymarket balance      --key-id <ID>
polymarket markets      --key-id <ID> [--query <Q>] [--slug <S>] [--active] [--limit <N>]
polymarket market       --key-id <ID> --condition-id <ID>
polymarket orderbook    --key-id <ID> --token-id <ID>
polymarket bet          --key-id <ID> --token-id <ID> --side <BUY|SELL> --amount <N> [--price <P>]
polymarket holdings     --key-id <ID>
polymarket open-orders  --key-id <ID> [--market <ID>]
polymarket trades       --key-id <ID>
polymarket cancel-order --key-id <ID> --order-id <ID>
polymarket cancel-all   --key-id <ID>
polymarket redeem       --key-id <ID> [--condition-ids <ID,ID>]

twitter search       --key-id <ID> --q <QUERY> [--max-results <N>] [--start-time <ISO>] [--end-time <ISO>]
twitter tweet        --key-id <ID> --tweet-id <ID>
twitter user         --key-id <ID> --username <NAME>
twitter user-tweets  --key-id <ID> --user-id <ID> [--max-results <N>]

brave web   --key-id <ID> --q <QUERY> [--count <N>] [--offset <N>] [--freshness <pd|pw|pm|py>] [--country <CC>]
brave news  --key-id <ID> --q <QUERY> [--count <N>] [--freshness <pd|pw|pm|py>]

trade-manager health
trade-manager status       --key-id <ID>
trade-manager create-rule  --key-id <ID> --market-id <ID> --token-id <ID> --rule-type <STOP_LOSS|TAKE_PROFIT|TRAILING_STOP> --trigger-price <P> [--trailing-percent <N>]
trade-manager list-rules   --key-id <ID> [--status <STATUS>]
trade-manager update-rule  --key-id <ID> --rule-id <ID> --trigger-price <P>
trade-manager delete-rule  --key-id <ID> --rule-id <ID>
trade-manager positions    --key-id <ID>
trade-manager events       --key-id <ID> [--rule-id <ID>] [--limit <N>] [--offset <N>]
```
