# Security Audit Report — 2026-02-10

## Overall Assessment: **Good**

The codebase demonstrates strong security awareness. Private keys are never returned in API responses, all DB queries use Prisma (no SQL injection risk), input validation is thorough via Zod, and there's proper auth on all sensitive endpoints. **No critical vulnerabilities** were found, but there are some medium and low-severity issues worth addressing.

---

## Findings

### 1. MEDIUM: `claimToken` exposed on `req.secret` unnecessarily

**Files:** `src/types/index.ts:15`, `src/api/middleware/apiKeyAuth.ts:64`

The `SecretSafeData` type includes `claimToken`, and the API key auth middleware selects it from the DB. While it's **never returned in API responses** (routes use `getSecretById` -> `toPublicData()` which excludes it), having the claim token on the request object is a latent risk. If any future endpoint accidentally returns `req.secret` directly, it would leak the claim token — which lets anyone claim ownership of the secret.

**Recommendation:** Remove `claimToken` from `SecretSafeData` and from the middleware's `select` clause.

---

### 2. MEDIUM: Internal error messages leaked to clients

**Files:** `src/api/routes/openclaw.routes.ts`, `src/api/routes/billing.routes.ts`

Many route handlers catch errors and pass them directly to the client:

```typescript
errors.internal(res, error.message);  // Leaks internal error details
```

The global `errorHandler` correctly masks errors in production (`NODE_ENV !== 'development'`), but these explicit catch blocks bypass it. Error messages from OVH, Stripe, SSH, or Prisma could leak infrastructure details.

**Examples:**
- `openclaw.routes.ts:76` — deploy errors
- `openclaw.routes.ts:89` — list errors
- `billing.routes.ts:37` — subscription errors

**Recommendation:** Use generic messages in catch blocks:
```typescript
errors.internal(res); // Uses default "Internal server error"
```
Log the real error server-side (which is already done with `console.error`).

---

### 3. MEDIUM: `validateApiKey` loads full secret (including private key) into memory

**File:** `src/services/apiKey.service.ts:103-111`

```typescript
const apiKey = await prisma.apiKey.findFirst({
  where: { keyHash, revokedAt: null },
  include: { secret: true },  // Loads secret.value (private key)
});
```

The `include: { secret: true }` loads the full `Secret` record including the `value` field (private key). While the API key auth middleware then does a separate safe query, the private key briefly exists in the `validateApiKey` return value. If this function is ever called from a different context, it could cause leakage.

**Recommendation:** Add a `select` to exclude `value`:
```typescript
include: {
  secret: {
    select: {
      id: true,
      deletedAt: true,
      // value: intentionally excluded
    }
  }
}
```
Only `secret.id` and `secret.deletedAt` are needed from this query.

---

### 4. LOW: Shell escaping in `buildSetupScript` uses single quotes

**File:** `src/services/openclaw.service.ts:263-427`

The setup script interpolates `openRouterApiKey` inside single-quoted strings:
```bash
openclaw config set env.OPENROUTER_API_KEY '${openRouterApiKey}'
```

If the OpenRouter key ever contained a single quote (`'`), it would break the shell escaping and allow command injection on the VPS. The key is API-generated (not user-controlled) and OpenRouter keys don't contain quotes, but this is fragile.

**Recommendation:** Validate the key format before interpolation:
```typescript
if (!/^sk-or-v1-[a-f0-9]+$/.test(openRouterApiKey)) {
  throw new Error('Unexpected OpenRouter key format');
}
```

---

### 5. LOW: No rate limiting on `POST /api/secrets/relink`

**File:** `src/api/routes/secrets.routes.ts:118-154`

The relink endpoint creates new API keys and is unauthenticated (the relink token is the auth). While tokens are one-time use and expire in 10 minutes, there's no rate limit on this endpoint beyond the global limit (100 req/min). An attacker brute-forcing relink tokens could generate high DB load.

**Recommendation:** Add a rate limiter similar to `secretCreationLimiter`.

---

### 6. LOW: CORS allows all origins in development

**File:** `src/app.ts:52`

```typescript
origin: env.NODE_ENV === 'production' ? process.env.FRONTEND_URL : '*',
```

In development, CORS allows all origins. This is standard, but ensure `NODE_ENV` is always set to `production` in deployed environments.

---

### 7. INFO: `successUrl`/`cancelUrl` in billing accept any URL

**Files:** `src/api/routes/billing.routes.ts:43-46`, `src/api/routes/openclaw.routes.ts:36-39`

Zod validates these as `z.string().url()` which allows any valid URL. These are passed to Stripe Checkout as redirect URLs. A user could set their own redirect to a phishing site, but since they're redirecting themselves after their own payment, this is a self-targeting issue.

**Recommendation:** Consider restricting to your own domain(s):
```typescript
successUrl: z.string().url().refine(url => url.startsWith(process.env.FRONTEND_URL!)),
```

---

## What's Done Well

- **Private keys never leak in responses** — `toPublicData()` pattern is consistent and well-documented
- **API key auth explicitly excludes `value` from `req.secret`** — with clear security comments
- **No SQL injection risk** — zero raw Prisma queries, all parameterized
- **No command injection** — SSH inputs from OpenClaw are either system-generated or regex-validated (`botToken`: `/^\d+:[A-Za-z0-9_-]+$/`, `code`: `/^[A-Za-z0-9-]+$/`)
- **Zod validation** on all request bodies
- **Rate limiting** on secret creation (5/15min) and globally (100/min)
- **API keys hashed with SHA-256** and only shown once
- **Claim tokens are one-time use** and expire
- **Stripe webhooks use signature verification**
- **Error details hidden in production** (in the global error handler)
- **Audit logging** doesn't capture private keys
- **OpenClaw `toPublicData`** strips SSH keys, internal hashes, and provisioning logs
