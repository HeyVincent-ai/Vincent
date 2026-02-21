# MCP Server

Vincent exposes a [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server that lets external agent runtimes — Claude, ChatGPT, Codex, Cursor, Manus, and others — use Vincent skills directly.

## How It Works

The MCP server is a JSON-RPC 2.0 endpoint at `/mcp`. It authenticates with the same `ssk_` Bearer tokens used by the REST API and exposes tools scoped to the API key's secret type.

```
External Agent Runtime
  │
  ├─ POST /mcp  { method: "initialize" }     → Server info + capabilities
  ├─ POST /mcp  { method: "tools/list" }      → Available tools for this key
  └─ POST /mcp  { method: "tools/call", params: { name, arguments } }
                                               → Execute tool → JSON result
```

All tool calls go through the same skill services and policy enforcement as REST API requests. Audit logs, spending limits, and approval flows all apply.

## Backend

### Files

| File | Purpose |
|---|---|
| `src/mcp/router.ts` | Express router — JSON-RPC dispatch, Bearer auth, error mapping |
| `src/mcp/tools.ts` | Tool definitions (24 tools), Zod validation, handler implementations |
| `src/app.ts` | Mounts router at `/mcp`, configures permissive CORS for MCP |

### Authentication

The router implements its own `authenticateMcpRequest()` function (not shared middleware) because MCP errors must be returned as JSON-RPC error responses rather than standard REST errors.

Flow:
1. Extract `Authorization: Bearer ssk_...` header
2. Validate API key via `validateApiKey()` (same service as REST)
3. Load secret metadata from database
4. Track API key usage
5. Attach `req.secret` and `req.apiKey` for tool handlers

### CORS

MCP needs to be accessible from external agent clients, so `/mcp` gets permissive CORS (`origin: '*'`, `credentials: false`) while the rest of the app uses the standard CORS config.

### JSON-RPC Methods

**`initialize`** — MCP handshake. Returns protocol version, server info, and capabilities. Echoes back the client's requested protocol version.

**`tools/list`** — Returns tool definitions filtered by the secret type of the authenticated API key. Each tool includes name, title, description, and JSON Schema for inputs.

**`tools/call`** — Executes a named tool with provided arguments. Validates that the tool exists and is available for the API key's secret type. Returns results wrapped in MCP content format (`{ content: [{ type: "text", text: "..." }] }`).

### Tool Definitions

Tools are defined in `src/mcp/tools.ts` as a `TOOLS` array. Each tool has:
- `name` — unique identifier (e.g., `vincent_wallet_transfer`)
- `title` — human-readable name
- `description` — what the tool does
- `inputSchema` — JSON Schema for arguments
- `secretTypes` — which secret types can use this tool
- `handler` — async function that validates args (Zod), calls the skill service, and logs to audit

### Tool Scope

| Secret Type | Tools (24 total) |
|---|---|
| `EVM_WALLET` (6) | transfer, send_transaction, balances, address, swap_preview, swap_execute |
| `POLYMARKET_WALLET` (10) | bet, markets, market, orderbook, positions, holdings, trades, balance, cancel_order, cancel_all |
| `RAW_SIGNER` (2) | sign, addresses |
| `DATA_SOURCES` (6) | brave_web_search, brave_news_search, twitter_search, twitter_get_tweet, twitter_get_user, twitter_user_tweets |

### Data Source Credit Billing

Data source tools (Brave, Twitter) use the `runDataSourceTool()` helper which:
1. Verifies the secret owner has a payment method or credit balance
2. Checks sufficient credit for the endpoint cost
3. Executes the handler
4. Deducts credit atomically
5. Logs usage and audit entries

### Error Handling

All errors are converted to JSON-RPC error responses via `parseToolError()`:
- Zod validation errors → code `-32602` (Invalid params)
- `AppError` with known codes → mapped to JSON-RPC error codes
- Unknown errors → code `-32000` (Server error)

HTTP status codes are also set appropriately (400, 401, 403, 404, 500).

## Frontend

### Files

| File | Purpose |
|---|---|
| `frontend/src/components/ConnectAgents.tsx` | Main UI — skill selector + accordion setup guides |
| `frontend/src/pages/AgentsConnect.tsx` | Page wrapper for ConnectAgents |
| `frontend/src/pages/AgentsLayout.tsx` | Tabbed layout with Deploy Agent / Connect Agent tabs |

### ConnectAgents Component

The `ConnectAgents` component provides setup instructions for connecting Vincent to 7 different agent runtimes:

1. **OpenClaw** — Install skill URL
2. **Claude Code** — `claude mcp add --transport http vincent <url>`
3. **Claude Web & Desktop** — Settings → Connectors → Add custom connector
4. **ChatGPT** — Settings → Apps → Add MCP Server
5. **Codex** — `codex mcp add vincent --url <url> --bearer-token <key>`
6. **Cursor** — Settings → MCP Servers → Add server
7. **Manus** — Settings → Connectors → Add Connector

Each runtime's instructions are shown in an accordion with numbered steps, copyable commands, and example prompts.

A skill selector at the top lets users switch between wallet, polymarket, brave search, and twitter — which updates the example prompts and (for OpenClaw) the skill URL.

### Integration Points

The ConnectAgents component appears in three places:

1. **`/agents/connect`** — Dedicated page via AgentsLayout tabs
2. **Dashboard empty state** — WelcomeOnboarding component (compact mode)
3. **Account page** — "Connect to Agents" section with link to `/agents/connect`

The OpenClawSection also has a "Connect Agent" button linking to `/agents/connect`.

### MCP URL Resolution

The `resolveMcpUrl()` helper computes the MCP endpoint URL from the frontend's `API_URL` env var:
- Strips `/api` suffix if present
- Appends `/mcp`
- Handles both absolute and relative API URLs
