# Skill CI Testing Plan

## Goal

Verify that an LLM agent can successfully read a SKILL.md file and use it to accomplish tasks against a live backend. This tests the full agent experience — not just "does the API work" but "can an agent follow these instructions to get things done."

## Architecture

```
┌─────────────────────────────────────────────────┐
│  GitHub Actions Workflow                        │
│  Trigger: manual OR changes to skills/**        │
│                                                 │
│  1. Derive Railway preview URL from PR number   │
│  2. Poll /health until preview is ready         │
│  3. Run skill-ci tests                          │
│                                                 │
│  ┌───────────────────────────────────────────┐  │
│  │  Vitest Test Suite (skill-ci/)            │  │
│  │                                           │  │
│  │  For each skill:                          │  │
│  │    1. Read SKILL.md                       │  │
│  │    2. Build system prompt with skill +    │  │
│  │       base URL                            │  │
│  │    3. Give agent a task                   │  │
│  │    4. Agent uses http_request tool to     │  │
│  │       call backend API                    │  │
│  │    5. Assert on results                   │  │
│  │                                           │  │
│  │  Agent: Vercel AI SDK + OpenRouter        │  │
│  │  Model: google/gemini-2.5-flash (cheap)   │  │
│  │  Tool: http_request                       │  │
│  └───────────────────────────────────────────┘  │
│                                                 │
│  ┌───────────────────────────────────────────┐  │
│  │  Railway Preview Instance                 │  │
│  │  URL: safeskill-vincent-pr-{N}.up.railway │  │
│  │  Full stack: DB + backend + frontend      │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Agent harness | Vercel AI SDK (`ai` + `@openrouter/ai-sdk-provider`) | Lightweight, OpenRouter-native, built-in tool loop |
| Model | Gemini 2.5 Flash via OpenRouter | Cheap (~$0.01/test), fast, good tool calling |
| Backend target | Railway preview instance per PR | Full stack already deployed, matches prod |
| Auth bootstrapping | None needed | `POST /api/secrets` is public — agents create their own secrets and get API keys, just like the real flow |
| Test runner | Vitest (separate config) | Same framework as rest of project, familiar |
| Trigger | `workflow_dispatch` + `pull_request` on `skills/**` paths | Only runs when skills change or manually triggered |

## Components

### 1. Agent Harness (`skill-ci/src/agent.ts`)

A thin wrapper around Vercel AI SDK's `generateText()` with tool calling:

```typescript
import { generateText } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

interface SkillTestResult {
  success: boolean;
  toolCalls: Array<{ name: string; args: any; result: any }>;
  finalText: string;
  error?: string;
}

async function runSkillAgent(opts: {
  skillContent: string;   // Full SKILL.md content
  task: string;           // What to ask the agent to do
  baseUrl: string;        // Railway preview URL
  model?: string;         // OpenRouter model ID
  maxSteps?: number;      // Max tool-calling rounds
}): Promise<SkillTestResult>
```

**System prompt** tells the agent:
- You are testing a skill against a live API
- The base URL is `{baseUrl}`
- Here are the skill instructions: `{skillContent}`
- Complete the task using the documented API endpoints
- Replace any placeholder URLs in the skill with the base URL

### 2. HTTP Request Tool (`skill-ci/src/tools.ts`)

Single tool the agent can use — makes HTTP requests:

```typescript
const httpRequestTool = tool({
  description: "Make an HTTP request to an API endpoint",
  parameters: z.object({
    method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]),
    url: z.string().describe("Full URL to request"),
    headers: z.record(z.string()).optional(),
    body: z.any().optional(),
  }),
  execute: async ({ method, url, headers, body }) => {
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: await response.text(),
    };
  },
});
```

### 3. Test Definitions (`skill-ci/src/tests/*.test.ts`)

Each skill gets a test file with one or more scenarios. Example:

```typescript
// skill-ci/src/tests/wallet.test.ts
import { runSkillAgent } from "../agent";
import { readFileSync } from "fs";

const BASE_URL = process.env.SKILL_CI_BASE_URL!;
const skillContent = readFileSync("skills/wallet/SKILL.md", "utf-8");

describe("Skill: wallet", () => {
  it("can create a wallet and check its balance", async () => {
    const result = await runSkillAgent({
      skillContent,
      baseUrl: BASE_URL,
      task: `Follow the skill instructions to:
        1. Create a new EVM wallet secret
        2. Use the returned API key to check the wallet balance
        Report the wallet address and balance.`,
    });

    expect(result.success).toBe(true);

    // Verify the agent made the expected API calls
    const calls = result.toolCalls.filter(c => c.name === "http_request");
    expect(calls.length).toBeGreaterThanOrEqual(2);

    // Verify a secret was created
    const createCall = calls.find(c =>
      c.args.url.includes("/api/secrets") && c.args.method === "POST"
    );
    expect(createCall).toBeDefined();
    expect(JSON.parse(createCall!.result.body).data.apiKey.key).toMatch(/^ssk_/);

    // Verify balance was checked
    const balanceCall = calls.find(c =>
      c.args.url.includes("/balance") && c.args.method === "GET"
    );
    expect(balanceCall).toBeDefined();
    expect(balanceCall!.result.status).toBe(200);
  }, 60_000); // 60s timeout for LLM + API calls
});
```

### 4. Test Scenarios Per Skill

**wallet**:
- Create a wallet secret, check balance, get address
- (Future: send a transaction if testnet funds available)

**brave-search**:
- Create a secret, search for a well-known term like "bitcoin"
- Verify search results are returned with titles and URLs

**twitter**:
- Create a secret, search for tweets about a well-known topic
- Verify tweet data is returned

**polymarket**:
- Create a secret, search/browse active markets
- Verify market data with outcomes and prices

> Note: Data source skills (Brave, Twitter) may require credits to be provisioned
> on the preview instance. We may need a seed step or test credit allocation.
> This is a detail to resolve during implementation.

### 5. GitHub Actions Workflow (`.github/workflows/skill-ci.yml`)

```yaml
name: Skill CI Tests

on:
  workflow_dispatch:
    inputs:
      preview_url:
        description: "Railway preview URL (optional — derived from PR if omitted)"
        required: false
        type: string
      model:
        description: "OpenRouter model to use"
        required: false
        default: "google/gemini-2.5-flash-preview"
        type: string
  pull_request:
    branches: [main]
    paths:
      - "skills/**"

jobs:
  skill-tests:
    name: Test Skills with Agent
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Install dependencies
        run: npm ci

      # Also install skill-ci deps
      - name: Install skill-ci dependencies
        run: cd skill-ci && npm ci

      - name: Determine preview URL
        id: preview
        run: |
          if [ -n "${{ inputs.preview_url }}" ]; then
            echo "url=${{ inputs.preview_url }}" >> "$GITHUB_OUTPUT"
          elif [ -n "${{ github.event.pull_request.number }}" ]; then
            echo "url=https://safeskill-vincent-pr-${{ github.event.pull_request.number }}.up.railway.app" >> "$GITHUB_OUTPUT"
          else
            echo "::error::No preview URL provided and not running in a PR context"
            exit 1
          fi

      - name: Wait for preview deployment
        run: |
          URL="${{ steps.preview.outputs.url }}/health"
          echo "Waiting for $URL ..."
          for i in $(seq 1 60); do
            if curl -sf "$URL" > /dev/null 2>&1; then
              echo "Preview is healthy!"
              exit 0
            fi
            echo "Attempt $i/60 — not ready yet, waiting 10s..."
            sleep 10
          done
          echo "::error::Preview deployment did not become healthy within 10 minutes"
          exit 1

      - name: Run skill tests
        run: cd skill-ci && npx vitest run
        env:
          SKILL_CI_BASE_URL: ${{ steps.preview.outputs.url }}
          OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
          SKILL_CI_MODEL: ${{ inputs.model || 'google/gemini-2.5-flash-preview' }}
```

### 6. Directory Structure

```
skill-ci/
  package.json              # Separate deps: ai, @openrouter/ai-sdk-provider, zod
  tsconfig.json
  vitest.config.ts          # Vitest config for skill-ci tests
  src/
    agent.ts                # runSkillAgent() — the mini agent harness
    tools.ts                # http_request tool definition
    types.ts                # Shared types
    tests/
      wallet.test.ts        # Wallet skill scenarios
      brave-search.test.ts  # Brave Search skill scenarios
      twitter.test.ts       # Twitter skill scenarios
      polymarket.test.ts    # Polymarket skill scenarios
```

Separate `package.json` keeps Vercel AI SDK deps out of the main project. The skill-ci
tests read `../skills/*/SKILL.md` to load skill content.

## Implementation Order

1. **Set up `skill-ci/` directory** — package.json, tsconfig, vitest config
2. **Build the agent harness** — `agent.ts` + `tools.ts` with `http_request` tool
3. **Write the wallet skill test** — simplest skill, good proving ground
4. **Write the GitHub Actions workflow** — with preview URL derivation + health polling
5. **Test locally** against staging or a running local instance
6. **Add remaining skill tests** — brave-search, twitter, polymarket
7. **Handle edge cases** — data source credits, timeouts, flakiness mitigation

## Open Questions / Risks

1. **Data source credits**: Brave Search and Twitter skills may need credits provisioned
   on the preview instance. May need to seed test credits or have a free tier for test keys.

2. **LLM flakiness**: Agent tests are inherently non-deterministic. Mitigations:
   - Use low temperature (0.0 or 0.1)
   - Keep tasks simple and specific
   - Retry once on failure
   - Assert on structural outcomes (API calls made, status codes) not exact text

3. **Cost**: Gemini Flash is very cheap (~$0.01-0.05 per full skill test). With 4 skills,
   each CI run costs roughly $0.04-0.20. Acceptable for manual/path-triggered runs.

4. **Railway preview timing**: The preview might not be ready when the CI job starts.
   The health polling step handles this with up to 10 minutes of waiting.

5. **Rate limiting**: `POST /api/secrets` is rate-limited to 5/15min per IP. If tests
   create many secrets, we may hit this. Can be mitigated by running tests sequentially
   with reasonable gaps, or by raising the limit for preview instances.
