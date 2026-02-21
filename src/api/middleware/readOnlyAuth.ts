import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../types/index.js';
import {
  validateReadOnlyToken,
  trackReadOnlyTokenUsage,
} from '../../services/readOnlyToken.service.js';
import { errors } from '../../utils/response.js';

const READ_ONLY_PREFIX = 'sro_';
const API_KEY_PREFIX = 'ssk_';

export async function readOnlyAuthMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    errors.unauthorized(res, 'Missing Authorization header');
    return;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    errors.unauthorized(res, 'Invalid Authorization header format. Expected: Bearer <token>');
    return;
  }

  const tokenValue = parts[1];

  if (tokenValue.startsWith(API_KEY_PREFIX)) {
    errors.unauthorized(res, 'API keys are not valid for read-only access');
    return;
  }

  if (!tokenValue.startsWith(READ_ONLY_PREFIX)) {
    errors.unauthorized(res, 'Invalid read-only token');
    return;
  }

  try {
    const result = await validateReadOnlyToken(tokenValue);

    if (!result.valid || !result.tokenId || !result.userId || !result.secretIds) {
      errors.unauthorized(res, 'Invalid or revoked read-only token');
      return;
    }

    req.readOnlyTokenId = result.tokenId;
    req.readOnlyUserId = result.userId;
    req.readOnlySecretIds = result.secretIds;

    trackReadOnlyTokenUsage(result.tokenId).catch(console.error);

    next();
  } catch (error) {
    console.error('Read-only auth error:', error);
    errors.internal(res, 'Authentication error');
  }
}

export function requireReadOnlySecretAccess(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const secretId = req.params.secretId || req.params.id;

  if (!secretId) {
    errors.badRequest(res, 'Missing secret ID in request');
    return;
  }

  if (!req.readOnlySecretIds) {
    errors.unauthorized(res, 'Not authenticated');
    return;
  }

  if (!req.readOnlySecretIds.includes(secretId)) {
    errors.forbidden(res, 'Read-only token does not have access to this secret');
    return;
  }

  next();
}
