# Security Model

## Core Security Principles

1. **Agents never see secrets.** Private keys, credentials, and raw secret values are never returned in API responses. The `toPublicData()` pattern consistently strips sensitive fields.

2. **API keys are one-way.** Agent API keys (`ssk_` prefix) are bcrypt-hashed in the database and shown only once at creation. The middleware iterates non-revoked keys and bcrypt-compares to validate.

3. **Policies gate all actions.** Every skill execution passes through the policy checker before reaching the blockchain/API. Default-open (no policies = allowed), but any restrictive policy must be satisfied.

4. **All actions are audited.** Fire-and-forget audit logging captures full input/output for every skill execution, policy change, API key operation, and administrative action.

## Authentication

Two auth paths, clearly separated:

| Path | Token format | Middleware | Used for |
|---|---|---|---|
| Session auth | Stytch session token | `validateSession` | Frontend, user management |
| API key auth | `ssk_<64 hex chars>` | `apiKeyAuth` | Agent skill execution |

The middleware distinguishes them by checking for the `ssk_` prefix.

## Secret Value Protection

- `req.secret` (set by API key middleware) explicitly excludes the `value` field via Prisma `select`
- `toPublicData()` on Secret model strips `value`, `claimToken`, and internal fields
- Private keys are only loaded from DB inside skill service functions, immediately before execution
- OpenClaw `toPublicData()` strips SSH keys, internal hashes, and provisioning logs
- Audit logging never captures private keys

## Input Validation

- All request bodies validated with Zod schemas before processing
- No raw SQL — all queries go through Prisma (parameterized)
- Shell inputs for OpenClaw SSH are regex-validated (bot tokens, codes)

## Rate Limiting

- Global: 100 requests/minute
- Secret creation: 5 per 15 minutes per IP
- Data source proxy: 60 requests/minute per API key
- OpenClaw deploy: 1 per minute per user, max 3 active deployments

## Claim Token Security

- Generated as 64-char hex (cryptographically random)
- One-time use — invalidated immediately after claiming
- Default expiry: 7 days
- Relink tokens: 10-minute expiry, also one-time use

## Stripe Webhook Security

- All webhooks verified via Stripe signature (`stripe.webhooks.constructEvent()`)
- Raw body captured via Express middleware for signature verification
- Idempotent webhook handlers

## Infrastructure

- PostgreSQL encrypted at rest (Railway-provided)
- CORS restricted to `FRONTEND_URL` in production, `*` in development
- Helmet middleware for security headers
- Error details hidden in production (generic messages, real errors logged server-side)

## Security Audit (2026-02-10)

An audit was conducted and documented at `plans/audit_2026-02-10/audit.md`. Overall assessment: **Good**. No critical vulnerabilities found.

### Key Findings

| # | Severity | Finding | Status |
|---|---|---|---|
| 1 | Medium | `claimToken` on `req.secret` unnecessarily (latent leak risk) | Fix planned |
| 2 | Medium | Internal error messages leaked to clients in some catch blocks | Fix planned |
| 3 | Medium | `validateApiKey` loads full secret including private key | Fix planned |
| 4 | Low | Shell escaping in `buildSetupScript` uses single quotes | Acknowledged |
| 5 | Low | No rate limiting on `POST /api/secrets/relink` | Fix planned |
| 6 | Low | CORS allows all origins in development | Expected |
| 7 | Info | `successUrl`/`cancelUrl` accept any URL (self-targeting) | Acknowledged |

### What's Done Well (per audit)

- Private keys never leak in responses
- API key auth explicitly excludes `value` from `req.secret`
- Zero raw Prisma queries (no SQL injection risk)
- No command injection vectors
- Zod validation on all request bodies
- API keys hashed with SHA-256 and shown only once
- Claim tokens are one-time use and expire
- Stripe webhooks use signature verification
