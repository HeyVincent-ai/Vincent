# SafeSkills

Secure secret management service for AI agents. TypeScript/Node.js backend with React frontend.

## Tech Stack

- **Runtime**: Node.js 22, ES2022 modules (`"type": "module"`)
- **Language**: TypeScript (strict mode, `NodeNext` module resolution)
- **Framework**: Express
- **Database**: Prisma ORM
- **Testing**: Vitest
- **Frontend**: React (in `frontend/`)

## Commands

- `npm test` — run all unit tests
- `npm run lint` — run ESLint
- `npm run lint:fix` — auto-fix lint issues
- `npx tsc --noEmit` — type-check
- `npx prisma generate` — regenerate Prisma client (run after schema changes)
- `npm run build` — full build (prisma generate + tsc + frontend)

## Project Structure

- `src/` — backend source
  - `api/` — route handlers
  - `services/` — business logic
  - `policies/` — authorization policies
  - `skills/` — skill definitions
  - `db/` — database utilities
  - `config/` — configuration
  - `utils/` — shared utilities
  - `e2e/` — end-to-end tests (not run in CI unit test step)
- `frontend/` — React frontend
- `skills/` — skill YAML definitions
- `skill-ci/` — skill integration test harness
- `prisma/` — Prisma schema and migrations

## Coding Conventions

- Use ES module imports (`import`/`export`), not CommonJS
- File extensions in imports: use `.js` extension for local imports (NodeNext resolution)
- Prefer `async`/`await` over raw promises
- Use Prisma for all database access
- Tests go next to source files as `*.test.ts`
- E2E tests go in `src/e2e/` as `*.e2e.test.ts`

## CI Checks

All of these must pass before a PR can merge:
1. `npm run lint` — no lint errors
2. `npx tsc --noEmit` — no type errors
3. `npm test` — all unit tests pass
