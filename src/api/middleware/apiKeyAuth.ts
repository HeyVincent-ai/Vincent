import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../types';
import { validateApiKey, trackApiKeyUsage } from '../../services/apiKey.service';
import { getSecretWithValue } from '../../services/secret.service';
import { errors } from '../../utils/response';

/**
 * Middleware to authenticate requests using API keys
 *
 * Expects the API key in the Authorization header:
 * Authorization: Bearer ssk_xxxxx
 *
 * On success, attaches apiKey and secret to the request
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

    // Get the full secret (with value for skill execution)
    const secret = await getSecretWithValue(result.secretId);

    if (!secret) {
      errors.unauthorized(res, 'Secret not found or deleted');
      return;
    }

    // Track API key usage (async, don't wait)
    trackApiKeyUsage(result.apiKey.id).catch(console.error);

    // Attach to request for downstream handlers
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
      const secret = await getSecretWithValue(result.secretId);

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
