# `@vincentai/cli` — Tasks

## Phase 1: Package Scaffolding ✅

- [x] **1.1** Create `cli/` directory with `package.json` (`@vincentai/cli`, bin field, type: module, no runtime deps)
- [x] **1.2** Create `cli/tsconfig.json` (ES2022, NodeNext, strict, outDir: dist)
- [x] **1.3** Create `cli/src/index.ts` — entry point with command router (parse `<group> <command>` from argv)
- [x] **1.4** Add npm scripts: `build`, `dev` (tsx), `lint`, `typecheck`
- [x] **1.5** Add `cli/` to root `.gitignore` for `cli/dist/`

## Phase 2: Core Libraries ✅

- [x] **2.1** Create `cli/src/lib/client.ts` — HTTP wrapper using Node built-in fetch
  - `vincentGet(path, apiKey, params?)`, `vincentPost(path, apiKey, body?)`, `vincentDelete(path, apiKey)`, `vincentPatch(path, apiKey, body)`
  - Default base URL `https://heyvincent.ai`, overridable via `VINCENT_BASE_URL`
  - Trade Manager base URL `http://localhost:19000`, overridable via `VINCENT_TRADE_MANAGER_URL`
  - Structured error handling (parse API error responses, output to stderr)
- [x] **2.2** Create `cli/src/lib/keystore.ts` — API key storage and retrieval
  - `storeKey(keyData)` — save to `${OPENCLAW_STATE_DIR:-$HOME/.openclaw}/credentials/<dir>/<keyId>.json`
  - `getKey(keyId)` — search both `agentwallet/` and `datasources/`, return API key string
  - `getKeyData(keyId)` — return full KeyData object
  - `listKeys(type?)` — list stored key IDs with type and memo
  - `findKey(type)` — auto-discover single key of a type (error if >1)
  - `resolveApiKey(flags, type)` — resolve from --key-id flag or auto-discover
  - Type mapping: EVM_WALLET/POLYMARKET_WALLET/RAW_SIGNER → `agentwallet/`, DATA_SOURCES → `datasources/`
- [x] **2.3** Create `cli/src/lib/args.ts` — CLI argument parser
  - Parse `--key value` pairs from process.argv
  - Support required vs optional params (getRequired, getOptional, getNumber, getRequiredNumber)
  - `--help` flag prints usage for any command via showHelp()
  - hasFlag() for boolean flags
- [x] **2.4** Create `cli/src/lib/types.ts` — shared types (KeyData, SecretType, ArgDef, VincentError)

## Phase 3: Secret Management Commands ✅

- [x] **3.1** `commands/secret/create.ts` — POST /api/secrets
  - Accepts: `--type`, `--memo`, optional `--chain-id`
  - Auto-stores returned API key via keystore
  - Outputs: `{ keyId, claimUrl, address?, secretId }`
- [x] **3.2** `commands/secret/relink.ts` — POST /api/secrets/relink
  - Accepts: `--token`
  - Auto-stores returned API key via keystore
  - Outputs: `{ keyId, secretId, type }`
- [x] **3.3** `commands/secret/list.ts` — list locally stored keys
  - Accepts: optional `--type` filter
  - Outputs: array of `{ id, type, memo, createdAt }`

## Phase 4: Skill Commands ✅

### Wallet (6 command files, ~11 subcommands)
- [x] **4.1** `commands/wallet/address.ts` — GET /api/skills/evm-wallet/address
- [x] **4.2** `commands/wallet/balances.ts` — GET /api/skills/evm-wallet/balances (optional `--chain-ids`)
- [x] **4.3** `commands/wallet/transfer.ts` — POST /api/skills/evm-wallet/transfer (`--to`, `--amount`, optional `--token`)
- [x] **4.4** `commands/wallet/swap.ts` — preview + execute subcommands for /api/skills/evm-wallet/swap/*
- [x] **4.5** `commands/wallet/send-tx.ts` — POST /api/skills/evm-wallet/send-transaction (`--to`, `--data`, optional `--value`)
- [x] **4.6** `commands/wallet/transfer-between.ts` — preview + execute + status subcommands for /api/skills/evm-wallet/transfer-between-secrets/*

### Raw Signer (2 command files)
- [x] **4.7** `commands/raw-signer/addresses.ts` — GET /api/skills/raw-signer/addresses
- [x] **4.8** `commands/raw-signer/sign.ts` — POST /api/skills/raw-signer/sign (`--message`, `--curve`)

### Polymarket (11 command files)
- [x] **4.9** `commands/polymarket/balance.ts` — GET /api/skills/polymarket/balance
- [x] **4.10** `commands/polymarket/markets.ts` — GET /api/skills/polymarket/markets (`--query`, `--slug`, `--active`, `--limit`)
- [x] **4.11** `commands/polymarket/market.ts` — GET /api/skills/polymarket/market/:id (`--condition-id`)
- [x] **4.12** `commands/polymarket/orderbook.ts` — GET /api/skills/polymarket/orderbook/:tokenId (`--token-id`)
- [x] **4.13** `commands/polymarket/bet.ts` — POST /api/skills/polymarket/bet (`--token-id`, `--side`, `--amount`, optional `--price`)
- [x] **4.14** `commands/polymarket/holdings.ts` — GET /api/skills/polymarket/holdings
- [x] **4.15** `commands/polymarket/open-orders.ts` — GET /api/skills/polymarket/open-orders (optional `--market`)
- [x] **4.16** `commands/polymarket/trades.ts` — GET /api/skills/polymarket/trades
- [x] **4.17** `commands/polymarket/cancel-order.ts` — DELETE /api/skills/polymarket/orders/:id (`--order-id`)
- [x] **4.18** `commands/polymarket/cancel-all.ts` — DELETE /api/skills/polymarket/orders
- [x] **4.19** `commands/polymarket/redeem.ts` — POST /api/skills/polymarket/redeem (optional `--condition-ids`)

### Twitter (4 command files)
- [x] **4.20** `commands/twitter/search.ts` — GET /api/data-sources/twitter/search (`--q`, optional `--max-results`, `--start-time`, `--end-time`)
- [x] **4.21** `commands/twitter/tweet.ts` — GET /api/data-sources/twitter/tweets/:id (`--tweet-id`)
- [x] **4.22** `commands/twitter/user.ts` — GET /api/data-sources/twitter/users/:username (`--username`)
- [x] **4.23** `commands/twitter/user-tweets.ts` — GET /api/data-sources/twitter/users/:id/tweets (`--user-id`, optional `--max-results`)

### Brave Search (2 command files)
- [x] **4.24** `commands/brave/web.ts` — GET /api/data-sources/brave/web (`--q`, optional `--count`, `--offset`, `--freshness`, `--country`)
- [x] **4.25** `commands/brave/news.ts` — GET /api/data-sources/brave/news (`--q`, optional `--count`, `--freshness`)

### Trade Manager (8 command files)
- [x] **4.26** `commands/trade-manager/health.ts` — GET /health (no auth needed)
- [x] **4.27** `commands/trade-manager/status.ts` — GET /status
- [x] **4.28** `commands/trade-manager/create-rule.ts` — POST /api/rules (`--market-id`, `--token-id`, `--rule-type`, `--trigger-price`, optional `--trailing-percent`)
- [x] **4.29** `commands/trade-manager/list-rules.ts` — GET /api/rules (optional `--status`)
- [x] **4.30** `commands/trade-manager/update-rule.ts` — PATCH /api/rules/:id (`--rule-id`, `--trigger-price`)
- [x] **4.31** `commands/trade-manager/delete-rule.ts` — DELETE /api/rules/:id (`--rule-id`)
- [x] **4.32** `commands/trade-manager/positions.ts` — GET /api/positions
- [x] **4.33** `commands/trade-manager/events.ts` — GET /api/events (optional `--rule-id`, `--limit`, `--offset`)

## Phase 5: Rewrite SKILL.md Files

- [ ] **5.1** Rewrite `skills/wallet/SKILL.md` — replace curl with CLI commands, remove key management prose
- [ ] **5.2** Rewrite `skills/polymarket/SKILL.md` — replace curl with CLI commands, remove key management prose
- [ ] **5.3** Rewrite `skills/trade-manager/SKILL.md` — replace curl with CLI commands (trade-manager commands use localhost)
- [ ] **5.4** Rewrite `skills/twitter/SKILL.md` — replace curl with CLI commands, remove key management prose
- [ ] **5.5** Rewrite `skills/brave-search/SKILL.md` — replace curl with CLI commands, remove key management prose

## Phase 6: Build, Test & Publish Pipeline

- [x] **6.1** Add build script to `cli/package.json` (tsc + chmod +x on bin entry)
- [x] **6.2** Test CLI locally (`node dist/index.js --help`, `secret list`, etc.) — verified working
- [ ] **6.3** Add CLI typecheck to root CI (`cd cli && npx tsc --noEmit`)
- [ ] **6.4** First publish to npm: `cd cli && npm publish --access public`
- [ ] **6.5** Update `scripts/publish_skill.sh` — optionally bump and publish CLI version alongside skills

## Learnings

- TypeScript narrows `string | boolean` better with `typeof val !== 'string'` than with `val === true` checks (the latter leaves `string | false` in the union)
- The CLI has zero runtime dependencies — uses only Node built-in `fetch`, `fs`, `path`, `os`
- `secret list` auto-discovers keys from `~/.openclaw/credentials/` directories — confirmed working with existing key files on disk
- All 33 command files + 4 lib files compile cleanly with `tsc --noEmit`

## Notes

- Zero runtime dependencies — only Node.js built-ins (fetch, fs, path, os). Fast npx cold start.
- Trade Manager commands use `http://localhost:19000` base URL (not `heyvincent.ai`)
- `secret create` and `secret relink` are the only commands that write to the keystore; all others are read-only
- Keep security model / prose / pricing / policies in SKILL.md — only replace curl blocks and key management instructions
- Frontmatter `requires.config` paths stay (needed for OpenClaw host auditing) but the prose explaining them is removed from the body
- The `--action` flag for trade-manager create-rule always passes `{"type": "SELL_ALL"}` (only supported action in MVP)
