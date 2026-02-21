# Raw Read-Only Access Requirements

## Purpose
- Provide an agent-consumable read-only representation of authenticated app pages.
- Let agents read the same data a human user sees, without expanding permissions.

## Scope
- Applies to all authenticated pages of the Vincent app.
- Admin and control pages are excluded.
- Policies are readable.

## Non-Goals
- No write access or mutations of any kind.
- No admin or internal tooling access.
- No exposure of secret values or API keys.

## Auth and Linking
- A read-only token is minted by presenting one or more existing `ssk_` API keys.
- The token is bound to the `secretId` of that API key and the owning `userId`.
- The token is valid only on `raw.heyvincent.ai` and is rejected on main API routes.
- The token is shown once at creation and stored hashed at rest.
- All provided API keys must belong to claimed secrets for a single user.
- Mint endpoint: `POST /api/read-only-tokens/mint` with `{ apiKeys: string[] }`.
- Token management: `GET /api/read-only-tokens` and `DELETE /api/read-only-tokens/:tokenId` (session auth).

## CLI Integration (Future)
- Linking must be fully non-interactive for CLI use.
- The link/mint endpoint returns JSON only (no redirects or HTML).
- Provide a discovery endpoint or documented index for raw routes and query params.
- Errors must be machine-friendly (stable codes + messages) for CLI handling.

## Access Rules
- Raw access is limited to the owning user of the linked secret.
- Data about other users or other secrets is never returned.
- Dashboard and list pages must be filtered to the accessible user and their secrets.
- Token scope is the union of secrets referenced by the provided API keys.
- Policies are returned in read-only form.

## Endpoint Constraints
- Raw endpoints are GET-only.
- Non-GET requests return `405`.
- Session tokens and `ssk_` tokens are rejected on raw endpoints.
- Admin routes always return `403` or `404`.
- Raw domain only serves `/api/raw/*` and `/health`.

## Response Format
- Responses are JSON view models aligned to UI routes.
- Each response includes `schema_version`, `generated_at`, `source_route`, `request_id`, `etag` in a `meta` block, and mirrors those values in response headers.
- Query parameters must match UI filters, sorts, and time ranges.

## Data Safety
- Apply existing public-data sanitization patterns.
- Never include secret `value`, API keys, claim tokens, relink tokens, or credentials.
- Redact PII that is not required for the page.

## Auditing and Rate Limiting
- Log all raw access with token id, user id, secret id, route, timestamp, response size.
- Rate-limit per token and per IP.

## Token Lifecycle
- Tokens are lifelong unless explicitly revoked.
- Track `createdAt`, `lastUsedAt`, and `revokedAt`.
- Provide a revocation path in the user UI.

## Operational Notes
- Schema changes require a Prisma migration for `ReadOnlyToken` + `ReadOnlyTokenSecret`.

## Page Coverage
- Dashboard
- Secret detail pages
- Policies tab
- API key metadata tab
- Audit logs
- Balances
- Data sources
- OpenClaw pages
- Billing pages
- Account pages

## Acceptance Criteria
- A raw token can only read data belonging to the user that owns the linked secret.
- Any write attempt fails.
- Policy data is visible read-only.
- Admin data is unreachable.
