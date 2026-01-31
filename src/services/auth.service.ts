import * as stytch from 'stytch';
import { env } from '../utils/env';
import prisma from '../db/client';
import { User } from '@prisma/client';
import { AppError } from '../api/middleware/errorHandler';

// Initialize Stytch client
let stytchClient: stytch.Client | null = null;

function getStytchClient(): stytch.Client {
  if (!stytchClient) {
    if (!env.STYTCH_PROJECT_ID || !env.STYTCH_SECRET) {
      throw new AppError('CONFIG_ERROR', 'Stytch credentials not configured', 500);
    }
    stytchClient = new stytch.Client({
      project_id: env.STYTCH_PROJECT_ID,
      secret: env.STYTCH_SECRET,
      env: env.STYTCH_ENV === 'live' ? stytch.envs.live : stytch.envs.test,
    });
  }
  return stytchClient;
}

/**
 * Send a magic link to the user's email
 */
export async function sendMagicLink(email: string, redirectUrl: string): Promise<void> {
  const client = getStytchClient();

  await client.magicLinks.email.loginOrCreate({
    email,
    login_magic_link_url: redirectUrl,
    signup_magic_link_url: redirectUrl,
  });
}

/**
 * Authenticate a magic link token and return/create the user
 */
export async function authenticateMagicLink(token: string): Promise<{
  user: User;
  sessionToken: string;
}> {
  const client = getStytchClient();

  const response = await client.magicLinks.authenticate({
    token,
    session_duration_minutes: 60 * 24 * 7, // 7 days
  });

  const stytchUserId = response.user.user_id;
  const email = response.user.emails[0]?.email;

  if (!email) {
    throw new AppError('AUTH_ERROR', 'No email found for Stytch user', 400);
  }

  // Find or create user in our database
  const user = await findOrCreateUser({ email, stytchUserId });

  return {
    user,
    sessionToken: response.session_token,
  };
}

/**
 * Authenticate an OAuth callback and return/create the user
 */
export async function authenticateOAuth(token: string): Promise<{
  user: User;
  sessionToken: string;
}> {
  const client = getStytchClient();

  const response = await client.oauth.authenticate({
    token,
    session_duration_minutes: 60 * 24 * 7, // 7 days
  });

  const stytchUserId = response.user.user_id;
  const email = response.user.emails[0]?.email;

  if (!email) {
    throw new AppError('AUTH_ERROR', 'No email found for OAuth user', 400);
  }

  const user = await findOrCreateUser({ email, stytchUserId });

  return {
    user,
    sessionToken: response.session_token,
  };
}

/**
 * Validate a session token and return the user
 */
export async function validateSession(sessionToken: string): Promise<User | null> {
  const client = getStytchClient();

  try {
    const response = await client.sessions.authenticate({
      session_token: sessionToken,
    });

    const stytchUserId = response.user.user_id;

    const user = await prisma.user.findUnique({
      where: { stytchUserId },
    });

    return user;
  } catch {
    return null;
  }
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
}): Promise<User> {
  const { email, stytchUserId } = params;

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
  return prisma.user.create({
    data: {
      email,
      stytchUserId,
    },
  });
}
