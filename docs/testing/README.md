# Testing Overview

## Test Framework

**Vitest** is used across the project. Run tests with:

```bash
npm test                    # All unit tests (root project)
cd skill-ci && npx vitest   # Skill CI tests (separate package)
```

## Unit Tests

Located next to source files as `*.test.ts`. Run via `npm test` from the project root.

**What's tested:**
- Route handlers (request/response shapes)
- Service functions (business logic)
- Trade manager worker logic

**Pattern:** Tests use Vitest's `describe`/`it`/`expect` with standard mocking.

## E2E Tests

Located in `src/e2e/` as `*.e2e.test.ts`. Not run in the CI unit test step — they require a running database and external services.

**Examples:**
- `takeOwnership.e2e.test.ts` — full ownership transfer flow with real ZeroDev calls

## Skill CI (LLM Agent Tests)

The most distinctive testing approach — uses an LLM agent to verify that skills work end-to-end against a live backend.

### How It Works

```
Vitest test file
  → Read SKILL.md for a skill
  → Give LLM agent the skill instructions + a task
  → Agent uses http_request tool to call backend API
  → Assert on structural outcomes (API calls made, status codes)
```

### Architecture

```
skill-ci/
├── src/
│   ├── agent.ts     # runSkillAgent() — Vercel AI SDK wrapper
│   ├── tools.ts     # http_request tool (fetch wrapper)
│   ├── types.ts     # Shared types
│   └── tests/
│       ├── wallet.test.ts       # Create wallet, check balance
│       ├── polymarket.test.ts   # Browse markets
│       ├── twitter.test.ts      # Search tweets
│       └── brave-search.test.ts # Web search
```

### Agent Harness

`runSkillAgent()` wraps Vercel AI SDK's `generateText()`:

- **Model:** Gemini 2.5 Flash via OpenRouter (~$0.01/test)
- **Tool:** Single `http_request` tool (method, url, headers, body)
- **System prompt:** Includes skill content + base URL + task
- **Max steps:** Configurable (default: reasonable for multi-call flows)

### Running Locally

```bash
cd skill-ci
SKILL_CI_BASE_URL=http://localhost:3000 \
OPENROUTER_API_KEY=sk-or-... \
npx vitest run
```

### CI Integration

GitHub Actions workflow (`.github/workflows/skill-ci.yml`):
- Triggers on `pull_request` when `skills/**` files change, or manually
- Derives Railway preview URL from PR number
- Polls `/health` until preview is ready (up to 10 min)
- Runs skill tests against the preview

### Design Decisions

| Decision | Choice | Why |
|---|---|---|
| Model | Gemini Flash | Cheap, fast, good tool calling |
| Target | Railway preview per PR | Full stack, matches production |
| Auth bootstrap | None needed | `POST /api/secrets` is public |
| Assertions | Structural (API calls, status codes) | Avoids LLM text flakiness |
| Flakiness mitigation | Low temperature, simple tasks, retries | Inherent non-determinism |

**Cost:** ~$0.04-0.20 per CI run (4 skill tests).

## CI Checks

All must pass before a PR can merge (from `CLAUDE.md`):

1. `npm run lint` — no lint errors
2. `npx tsc --noEmit` — no type errors
3. `npm test` — all unit tests pass

## Commands Reference

```bash
npm test              # Run unit tests
npm run lint          # ESLint
npm run lint:fix      # Auto-fix lint issues
npx tsc --noEmit      # Type-check
npx prisma generate   # Regenerate Prisma client (after schema changes)
npm run build         # Full build (prisma generate + tsc + frontend)
```
