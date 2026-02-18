import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../types/index.js';
import { validateSessionWithRoles } from '../../services/auth.service.js';
import { verifySecretOwnership } from '../../services/secret.service.js';
import { errors } from '../../utils/response.js';

/**
 * Extract session token from request.
 * Supports: Authorization: Bearer <token> and cookie-based sessions.
 */
function extractSessionToken(req: AuthenticatedRequest): string | null {
  // Check Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      // Only treat non-API-key tokens as session tokens
      if (!parts[1].startsWith('ssk_')) {
        return parts[1];
      }
    }
  }

  // Check cookie
  const cookieToken =
    (req.cookies as Record<string, string> | undefined)?.session_token ??
    (req.headers['x-session-token'] as string | undefined);

  return cookieToken ?? null;
}

/**
 * Middleware to authenticate requests using Stytch session tokens.
 * Attaches user to the request on success.
 */
export async function sessionAuthMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const sessionToken = extractSessionToken(req);

  if (!sessionToken) {
    errors.unauthorized(res, 'Missing session token');
    return;
  }

  try {
    const { user, roles } = await validateSessionWithRoles(sessionToken);

    if (!user) {
      errors.unauthorized(res, 'Invalid or expired session');
      return;
    }

    req.user = user;
    req.stytchRoles = roles;
    next();
  } catch (error) {
    console.error('Session auth error:', error);
    errors.unauthorized(res, 'Session validation failed');
  }
}

/**
 * Optional session auth - doesn't fail if no session provided.
 */
export async function optionalSessionAuthMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const sessionToken = extractSessionToken(req);

  if (!sessionToken) {
    next();
    return;
  }

  try {
    const { user, roles } = await validateSessionWithRoles(sessionToken);
    if (user) {
      req.user = user;
      req.stytchRoles = roles;
    }
    next();
  } catch {
    next();
  }
}

/**
 * Middleware to verify the authenticated user owns the secret specified in :id or :secretId.
 * Must be used after sessionAuthMiddleware.
 */
export async function requireSecretOwnership(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.user) {
    errors.unauthorized(res, 'Not authenticated');
    return;
  }

  const secretId =
    (req.params as Record<string, string>).secretId || (req.params as Record<string, string>).id;

  if (!secretId) {
    errors.badRequest(res, 'Missing secret ID in request');
    return;
  }

  const isOwner = await verifySecretOwnership(secretId, req.user.id);

  if (!isOwner) {
    errors.forbidden(res, 'You do not own this secret');
    return;
  }

  next();
}
