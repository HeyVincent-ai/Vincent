# Skill CI — Implementation Tasks

Reference: [plan.md](./plan.md)

## Phase 1: Scaffolding

- [x] **Task 1.1**: Create `skill-ci/` directory with `package.json` (deps: `ai@^6`, `@openrouter/ai-sdk-provider@^2`, `zod`, `vitest`)
- [x] **Task 1.2**: Create `tsconfig.json` and `vitest.config.ts` for skill-ci
- [x] **Task 1.3**: Add npm scripts — `test` (vitest run), `test:watch` (vitest)

## Phase 2: Agent Harness

- [x] **Task 2.1**: Build `src/agent.ts` — `runSkillAgent()` function using Vercel AI SDK v6 `generateText()` with `stopWhen: stepCountIs(N)` for agentic tool loop. Takes skill content, task prompt, base URL. Returns `SkillTestResult` with success/failure, tool calls log, and final text.
- [x] **Task 2.2**: Build `src/tools.ts` — `http_request` tool (method, url, headers, body → status, headers, body). Uses native `fetch`. Body handler detects string vs object to avoid double-serialization.
- [x] **Task 2.3**: Build `src/types.ts` — shared types (`SkillTestResult`, `ToolCallRecord`)

## Phase 3: First Skill Test (Wallet)

- [x] **Task 3.1**: Write `src/tests/wallet.test.ts` — test that the agent can read the wallet SKILL.md, create a secret, get an API key, and check wallet balance. Assert on: secret created (status 201, `ssk_` key returned), balance checked (status 200).
- [x] **Task 3.2**: Test locally against production. Debugged and fixed: body double-serialization issue, model ID (`google/gemini-2.5-flash` not `-preview`). Test passes reliably (~7s).

## Phase 4: GitHub Actions Workflow

- [x] **Task 4.1**: Create `.github/workflows/skill-ci.yml` — triggers on `workflow_dispatch` (with optional URL + model inputs) and `pull_request` with `paths: skills/**`. Derives Railway preview URL from PR number, polls `/health`, runs `cd skill-ci && npx vitest run`.
- [ ] **Task 4.2**: Add `CI_OPENROUTER_API_KEY` to repo secrets (user will do this). Open a test PR touching `skills/` to verify the full pipeline.

## Phase 5: Remaining Skill Tests

- [ ] **Task 5.1**: Write `src/tests/brave-search.test.ts` — create secret, search for a term, verify results returned
- [ ] **Task 5.2**: Write `src/tests/twitter.test.ts` — create secret, search tweets, verify results
- [ ] **Task 5.3**: Write `src/tests/polymarket.test.ts` — create secret, browse/search markets, verify market data
- [ ] **Task 5.4**: Handle data source credits issue (seed test credits, free tier for non-prod, or Stripe test card flow)

## Phase 6: Hardening

- [x] **Task 6.1**: Add retry logic (vitest `retry: 1` in config)
- [x] **Task 6.2**: Add test timeout configuration (120s per test in vitest config)
- [ ] **Task 6.3**: Consider adding a summary/report output to the GitHub Actions step (e.g., which skills passed/failed)

## Implementation Learnings

- **AI SDK v6**: Uses `stopWhen: stepCountIs(N)` instead of the old `maxSteps`. Tool schemas use `inputSchema` (not `parameters`) for TypeScript types. Step results use `staticToolCalls[].input` and `staticToolResults[].output` (not `args`/`result`).
- **OpenRouter model ID**: `google/gemini-2.5-flash` (not `google/gemini-2.5-flash-preview`).
- **Body serialization**: LLMs may pass the body as a JSON string rather than an object. The tool must handle both (check `typeof body === "string"`) to avoid double-serialization → 500 errors.
- **Env variable**: Using `CI_OPENROUTER_API_KEY` in `.env` and GitHub secrets. Agent checks both `OPENROUTER_API_KEY` and `CI_OPENROUTER_API_KEY`.
- **URL replacement**: Gemini Flash successfully uses the base URL from the system prompt to construct request URLs against heyvincent.ai. The skill content references `https://heyvincent.ai` and the system prompt instructs replacement.
