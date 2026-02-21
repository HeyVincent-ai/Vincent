# Authentication & Authorization

## Two Auth Paths

Vincent supports two authentication mechanisms, used for different audiences:

### 1. Session Auth (Users / Frontend)

Used by the React frontend for dashboard, secret management, billing, etc.

**Provider:** Stytch (magic links + Google OAuth via Stytch UI SDK)

**Flow:**
1. Frontend renders `<StytchLogin>` component (email magic links + Google OAuth)
2. After Stytch auth, frontend detects session via `useStytchSession` hook
3. Frontend calls `POST /api/auth/session` with the Stytch session token
4. Backend validates token via Stytch SDK, finds or creates user
5. Session token stored in localStorage, sent as `Authorization: Bearer <token>` or `x-session-token` header

**Middleware:** `validateSession` in `src/api/middleware/sessionAuth.ts`
- Extracts token from Authorization header (skips if `ssk_` prefix)
- Validates via Stytch `sessions.authenticate()`
- Loads/creates user record, sets `req.user`
- 7-day session duration

**Ownership middleware:** `requireSecretOwnership`
- Used on secret-specific routes (policies, API keys, audit logs)
- Verifies `req.user.id` matches `secret.userId`
- Composable — applied after `validateSession`

### 2. API Key Auth (Agents)

Used by AI agents for all skill execution endpoints.

**Format:** `ssk_<64 hex chars>` (prefix enables easy identification)

**Flow:**
1. Agent sends `Authorization: Bearer ssk_...`
2. Middleware validates by iterating all non-revoked keys and bcrypt-comparing
3. Loads secret metadata onto `req.secret` (explicitly excludes `value` field)
4. Sets `req.apiKeyId`

**Middleware:** `apiKeyAuth` in `src/api/middleware/apiKeyAuth.ts`
- Also has `optionalApiKeyAuth` variant for dual-purpose endpoints

**Security notes:**
- Keys are bcrypt-hashed in DB — plain key shown only once at creation
- Each key is scoped to exactly one secret
- Revoked keys (non-null `revokedAt`) are skipped during validation
- `req.secret` explicitly excludes `value` via Prisma `select` clause

## API Key Lifecycle

```
Agent creates secret (POST /api/secrets)
  → Backend generates ssk_ key
  → Hashes with bcrypt, stores hash
  → Returns plain key once (never again)

Agent authenticates
  → Sends key in Authorization header
  → Middleware bcrypt-compares against non-revoked keys
  → On match: loads secret metadata, sets req.secret + req.apiKeyId

User manages keys (frontend)
  → Create additional keys (POST /api/secrets/:id/api-keys)
  → List keys (GET, shows name/created/status, never the key itself)
  → Revoke keys (DELETE, sets revokedAt)

User generates relink token
  → POST /api/secrets/:id/relink-token (session auth)
  → Returns one-time token (10-min expiry, in-memory storage)
  → Agent exchanges token for new API key (POST /api/secrets/relink)
```

## Auth Decision: Which Endpoints Use What

| Auth type | Endpoints | Why |
|---|---|---|
| None | `POST /api/secrets`, `POST /api/secrets/relink` | Agent bootstrap — no auth exists yet |
| API Key | All `/api/skills/*`, `/api/data-sources/*` | Agent execution |
| Session | All `/api/user/*`, `/api/billing/*`, `/api/openclaw/*` | User management |
| Session + Ownership | `/api/secrets/:id/*` (policies, keys, logs, balances) | User manages their own secrets |
| Stripe signature | `POST /api/billing/webhook` | Stripe webhook verification |

## Files

- `src/services/auth.service.ts` — Stytch SDK integration, `syncSession()`, find-or-create user
- `src/api/middleware/sessionAuth.ts` — `validateSession`, `optionalSession`, `requireSecretOwnership`
- `src/api/middleware/apiKeyAuth.ts` — `apiKeyAuth`, `optionalApiKeyAuth`
- `src/services/apiKey.service.ts` — Key generation, validation, listing, revocation
- `src/api/routes/auth.routes.ts` — `POST /api/auth/session`
