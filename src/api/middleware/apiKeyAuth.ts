import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../types/index.js';
import { validateApiKey, trackApiKeyUsage } from '../../services/apiKey.service.js';
import { errors } from '../../utils/response.js';
import prisma from '../../db/client.js';

/**
 * Middleware to authenticate requests using API keys
 *
 * Expects the API key in the Authorization header:
 * Authorization: Bearer ssk_xxxxx
 *
 * On success, attaches apiKey and secret (WITHOUT the private key value) to the request.
 *
 * SECURITY NOTE: The secret's `value` field (private key) is intentionally NOT attached
 * to the request object. Skill services that need the private key must fetch it directly
 * from the database at execution time. This prevents accidental exposure of private keys
 * through logging, error serialization, or careless code changes.
 */
export async function apiKeyAuthMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    errors.unauthorized(res, 'Missing Authorization header');
    return;
  }

  // Extract the token from "Bearer <token>"
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    errors.unauthorized(res, 'Invalid Authorization header format. Expected: Bearer <api_key>');
    return;
  }

  const apiKeyValue = parts[1];

  try {
    // Validate the API key
    const result = await validateApiKey(apiKeyValue);

    if (!result.valid || !result.apiKey || !result.secretId) {
      errors.unauthorized(res, 'Invalid or revoked API key');
      return;
    }

    // SECURITY: Fetch secret WITHOUT the value field to prevent private key exposure.
    // The `select` explicitly excludes `value` so even if this object is logged or
    // serialized, the private key cannot leak.
    const secret = await prisma.secret.findFirst({
      where: {
        id: result.secretId,
        deletedAt: null,
      },
      select: {
        id: true,
        userId: true,
        type: true,
        // value: intentionally NOT selected - private key must never be on request object
        memo: true,
        claimedAt: true,
        deletedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!secret) {
      errors.unauthorized(res, 'Secret not found or deleted');
      return;
    }

    // Track API key usage (async, don't wait)
    trackApiKeyUsage(result.apiKey.id).catch(console.error);

    // Attach to request for downstream handlers
    // SECURITY: req.secret contains only safe metadata, never the private key
    req.apiKey = result.apiKey;
    req.secret = secret;

    next();
  } catch (error) {
    console.error('API key auth error:', error);
    errors.internal(res, 'Authentication error');
  }
}

/**
 * Optional API key auth - doesn't fail if no key provided
 * Useful for endpoints that behave differently based on auth status
 *
 * SECURITY NOTE: Like apiKeyAuthMiddleware, this does NOT attach the private key
 * value to the request object.
 */
export async function optionalApiKeyAuthMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  // No auth header is fine for optional auth
  if (!authHeader) {
    next();
    return;
  }

  // If header is present, validate it
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    // Invalid format, but this is optional - just skip
    next();
    return;
  }

  const apiKeyValue = parts[1];

  try {
    const result = await validateApiKey(apiKeyValue);

    if (result.valid && result.apiKey && result.secretId) {
      // SECURITY: Fetch secret WITHOUT the value field
      const secret = await prisma.secret.findFirst({
        where: {
          id: result.secretId,
          deletedAt: null,
        },
        select: {
          id: true,
          userId: true,
          type: true,
          // value: intentionally NOT selected
          memo: true,
          claimedAt: true,
          deletedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (secret) {
        req.apiKey = result.apiKey;
        req.secret = secret;
        trackApiKeyUsage(result.apiKey.id).catch(console.error);
      }
    }

    next();
  } catch (error) {
    console.error('Optional API key auth error:', error);
    // Don't fail for optional auth
    next();
  }
}

/**
 * Middleware to ensure the authenticated API key has access to a specific secret
 * Must be used after apiKeyAuthMiddleware
 * Checks that the secret ID in the route matches the API key's secret
 */
export function requireSecretAccess(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const secretId = req.params.secretId || req.params.id;

  if (!secretId) {
    errors.badRequest(res, 'Missing secret ID in request');
    return;
  }

  if (!req.secret) {
    errors.unauthorized(res, 'Not authenticated');
    return;
  }

  if (req.secret.id !== secretId) {
    errors.forbidden(res, 'API key does not have access to this secret');
    return;
  }

  next();
}
