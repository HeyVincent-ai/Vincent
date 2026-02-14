import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../types/index.js';
import { apiKeyAuthMiddleware } from './apiKeyAuth.js';
import { sessionAuthMiddleware } from './sessionAuth.js';

/**
 * Authenticate using either a session token (preferred for user requests)
 * or an API key (for agent requests).
 */
export async function sessionOrApiKeyAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      if (parts[1].startsWith('ssk_')) {
        return apiKeyAuthMiddleware(req, res, next);
      }
    }
  }

  return sessionAuthMiddleware(req, res, next);
}
