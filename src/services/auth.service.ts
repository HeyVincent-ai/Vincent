import * as stytch from 'stytch';
import { env } from '../utils/env.js';
import prisma from '../db/client.js';
import { User } from '@prisma/client';
import { AppError } from '../api/middleware/errorHandler.js';
import * as referralService from './referral.service.js';

// Initialize Stytch client
let stytchClient: stytch.Client | null = null;

function getStytchClient(): stytch.Client {
  if (!stytchClient) {
    console.log(
      'Initializing Stytch client with project:',
      env.STYTCH_PROJECT_ID,
      'env:',
      env.STYTCH_ENV
    );
    stytchClient = new stytch.Client({
      project_id: env.STYTCH_PROJECT_ID,
      secret: env.STYTCH_SECRET,
      env: env.STYTCH_ENV === 'live' ? stytch.envs.live : stytch.envs.test,
    });
  }
  return stytchClient;
}

/**
 * Validate a Stytch session token and find/create the user in our DB.
 * Called after the Stytch frontend SDK authenticates the user.
 */
export async function syncSession(
  sessionToken: string,
  referralCode?: string
): Promise<{ user: User; roles: string[] } | null> {
  const client = getStytchClient();

  try {
    const response = await client.sessions.authenticate({
      session_token: sessionToken,
    });

    const stytchUserId = response.user.user_id;
    const email = response.user.emails[0]?.email;
    const roles: string[] = response.user.roles ?? [];

    if (!email) {
      throw new AppError('AUTH_ERROR', 'No email found for Stytch user', 400);
    }

    const user = await findOrCreateUser({ email, stytchUserId, referralCode });
    return { user, roles };
  } catch (err: unknown) {
    const stytchErr = err as { status_code?: number; error_type?: string; error_message?: string };
    console.error('syncSession failed:', {
      status_code: stytchErr.status_code,
      error_type: stytchErr.error_type,
      error_message: stytchErr.error_message,
      raw: err,
    });
    return null;
  }
}

/**
 * Validate a session token and return the user along with their Stytch RBAC roles.
 */
export async function validateSessionWithRoles(
  sessionToken: string
): Promise<{ user: User | null; roles: string[] }> {
  const client = getStytchClient();

  try {
    const response = await client.sessions.authenticate({
      session_token: sessionToken,
    });

    const stytchUserId = response.user.user_id;
    const roles: string[] = response.user.roles ?? [];

    if (env.NODE_ENV !== 'production') {
      console.log('[auth] user roles:', roles);
    }

    const user = await prisma.user.findUnique({
      where: { stytchUserId },
    });

    return { user, roles };
  } catch (error: unknown) {
    // Log a sanitized subset of the error for debugging (similar to syncSession)
    const errObj = error && typeof error === 'object' ? (error as Record<string, unknown>) : null;
    const status =
      errObj && ('status_code' in errObj || 'status' in errObj)
        ? (errObj.status_code ?? errObj.status)
        : undefined;
    const type =
      errObj && ('error_type' in errObj || 'code' in errObj)
        ? (errObj.error_type ?? errObj.code)
        : undefined;

    console.error('[auth] validateSessionWithRoles error', {
      status,
      type,
      message: error instanceof Error ? error.message : String(error),
    });
    return { user: null, roles: [] };
  }
}

/**
 * Validate a session token and return the user
 */
export async function validateSession(sessionToken: string): Promise<User | null> {
  const { user } = await validateSessionWithRoles(sessionToken);
  return user;
}

/**
 * Revoke a session
 */
export async function revokeSession(sessionToken: string): Promise<void> {
  const client = getStytchClient();

  await client.sessions.revoke({
    session_token: sessionToken,
  });
}

/**
 * Find or create a user in our database based on Stytch identity
 */
async function findOrCreateUser(params: {
  email: string;
  stytchUserId: string;
  referralCode?: string;
}): Promise<User> {
  const { email, stytchUserId, referralCode } = params;

  // Try to find by stytchUserId first
  let user = await prisma.user.findUnique({
    where: { stytchUserId },
  });

  if (user) return user;

  // Try to find by email (user may have been created before Stytch linking)
  user = await prisma.user.findUnique({
    where: { email },
  });

  if (user) {
    // Link the Stytch ID to existing user
    return prisma.user.update({
      where: { id: user.id },
      data: { stytchUserId },
    });
  }

  // Create new user
  const newUser = await prisma.user.create({
    data: {
      email,
      stytchUserId,
    },
  });

  // Record referral if a code was provided
  if (referralCode) {
    try {
      await referralService.recordReferral(referralCode, newUser.id);
    } catch (err: unknown) {
      console.error('[auth] Failed to record referral:', err instanceof Error ? err.message : err);
    }
  }

  return newUser;
}
