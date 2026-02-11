# Security Audit Tasks — 2026-02-10

## Task 1: Remove `claimToken` from `SecretSafeData` and API key auth middleware

**Severity:** MEDIUM
**Audit finding:** #1

**Files to change:**
- `src/types/index.ts` — Remove `claimToken` from the `SecretSafeData` interface
- `src/api/middleware/apiKeyAuth.ts` — Remove `claimToken: true` from the `select` clause in both `apiKeyAuthMiddleware` and `optionalApiKeyAuthMiddleware`

**What to do:**
1. In `src/types/index.ts`, remove `claimToken: string | null;` from `SecretSafeData` and remove the `claimToken` assignment from `toSecretSafeData()`
2. In `src/api/middleware/apiKeyAuth.ts`, remove `claimToken: true` from both `select` blocks (lines ~64 and ~138)
3. Verify no downstream code reads `req.secret.claimToken` — search for `secret.claimToken` or `secret?.claimToken` across the codebase

---

## Task 2: Stop leaking internal error messages to clients

**Severity:** MEDIUM
**Audit finding:** #2

**Files to change:**
- `src/api/routes/openclaw.routes.ts` — All `errors.internal(res, error.message)` calls
- `src/api/routes/billing.routes.ts` — All `errors.internal(res, error.message)` calls

**What to do:**
1. Replace every `errors.internal(res, error.message)` with `errors.internal(res)` (uses default "Internal server error")
2. The `console.error` lines above each call already log the real error for debugging — no changes needed there
3. Specific locations in `openclaw.routes.ts`: lines 76, 89, 107, 129, 145, 162, 182, 202, 225, 241, 270, 290, 323, 355
4. Specific locations in `billing.routes.ts`: lines 37, 139, 163, 198

---

## Task 3: Stop loading private key in `validateApiKey`

**Severity:** MEDIUM
**Audit finding:** #3

**Files to change:**
- `src/services/apiKey.service.ts` — The `validateApiKey` function

**What to do:**
1. Change `include: { secret: true }` to use a select that excludes `value`:
   ```typescript
   include: {
     secret: {
       select: {
         id: true,
         deletedAt: true,
       }
     }
   }
   ```
2. Update the `ValidateApiKeyResult` type if needed — `secretId` is already a separate field, so the full `Secret` object isn't needed by callers
3. Verify the only fields used from `apiKey.secret` in calling code are `id` (via `apiKey.secretId`) and `deletedAt` (for the null check on line 113)
