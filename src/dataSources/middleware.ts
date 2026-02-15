import { Response, NextFunction } from 'express';
import { User } from '@prisma/client';
import { AuthenticatedRequest } from '../types/index.js';
import { errors } from '../utils/response.js';
import prisma from '../db/client.js';

export interface DataSourceRequest extends AuthenticatedRequest {
  dataSourceUser: User;
}

/**
 * Data source guard middleware. Runs AFTER apiKeyAuthMiddleware.
 *
 * Checks:
 * 1. Secret type is DATA_SOURCES
 * 2. Secret has been claimed (associated with a user)
 * 3. User has a payment method on file OR has remaining credit
 *
 * Attaches req.dataSourceUser (the User record) for downstream handlers.
 */
export async function dataSourceGuard(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.secret) {
    errors.unauthorized(res, 'Not authenticated');
    return;
  }

  if (req.secret.type !== 'DATA_SOURCES') {
    errors.forbidden(res, 'API key is not scoped to a DATA_SOURCES secret');
    return;
  }

  if (!req.secret.userId) {
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    errors.forbidden(
      res,
      `Secret not claimed. Visit ${baseUrl}/claim/${req.secret.id} to claim and activate.`
    );
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: req.secret.userId },
  });

  if (!user) {
    errors.forbidden(res, 'Secret owner not found');
    return;
  }

  // User must have a payment method OR remaining free credit
  const hasCredit = user.dataSourceCreditUsd.toNumber() > 0;
  const hasPaymentMethod = !!user.stripeCustomerId;

  if (!hasCredit && !hasPaymentMethod) {
    errors.forbidden(
      res,
      'Credit card required. Please add a payment method to continue using data sources.'
    );
    return;
  }

  (req as DataSourceRequest).dataSourceUser = user;
  next();
}
