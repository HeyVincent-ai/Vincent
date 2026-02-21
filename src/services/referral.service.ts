import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '../db/client.js';
import * as openRouterService from './openrouter.service.js';
import { sendReferralRewardEmail } from './email.service.js';

const REWARD_AMOUNT_USD = 10;

/**
 * Get or create a referral code for a user.
 * Idempotent — returns existing code if one exists.
 */
export async function getOrCreateReferralCode(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { referralCode: true },
  });

  if (user?.referralCode) return user.referralCode;

  // Generate a unique 8-char hex code
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = crypto.randomBytes(4).toString('hex');
    try {
      const updated = await prisma.user.update({
        where: { id: userId },
        data: { referralCode: code },
      });
      return updated.referralCode!;
    } catch (err: unknown) {
      // Unique constraint violation — retry with a new code
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') continue;
      throw err;
    }
  }

  throw new Error('Failed to generate unique referral code');
}

/**
 * Record a referral when a new user signs up with a referral code.
 * No-ops silently if the code is invalid, self-referral, or user already referred.
 */
export async function recordReferral(referralCode: string, referredUserId: string): Promise<void> {
  // Find the referrer by code
  const referrer = await prisma.user.findUnique({
    where: { referralCode },
    select: { id: true },
  });

  if (!referrer) {
    console.log(`[referral] Invalid referral code: ${referralCode}`);
    return;
  }

  // Prevent self-referral
  if (referrer.id === referredUserId) {
    console.log(`[referral] Self-referral attempt blocked for user ${referredUserId}`);
    return;
  }

  // Check if referred user already has a referral record
  const existing = await prisma.referral.findUnique({
    where: { referredUserId },
  });

  if (existing) {
    console.log(`[referral] User ${referredUserId} already has a referral record`);
    return;
  }

  await prisma.referral.create({
    data: {
      referrerId: referrer.id,
      referredUserId,
      status: 'PENDING',
      rewardAmountUsd: REWARD_AMOUNT_USD,
    },
  });

  console.log(`[referral] Recorded referral: ${referrer.id} referred ${referredUserId}`);
}

/**
 * Attempt to fulfill a referral reward when the referred user makes their first payment.
 * If the referrer has an active deployment, applies $10 credit immediately.
 * Otherwise, queues the reward as REWARD_PENDING.
 */
export async function fulfillReferralReward(referredUserId: string): Promise<void> {
  // Find the PENDING referral for this user
  const referral = await prisma.referral.findFirst({
    where: { referredUserId, status: 'PENDING' },
  });

  if (!referral) return; // No pending referral — nothing to do

  const rewardAmount = Number(referral.rewardAmountUsd);

  // Find the referrer's active deployment
  const deployment = await prisma.openClawDeployment.findFirst({
    where: {
      userId: referral.referrerId,
      status: { in: ['READY', 'CANCELING'] },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!deployment) {
    // Queue the reward for later
    await prisma.referral.update({
      where: { id: referral.id },
      data: { status: 'REWARD_PENDING' },
    });
    console.log(
      `[referral] Reward queued (REWARD_PENDING) for referrer ${referral.referrerId} — no active deployment`
    );
    return;
  }

  // Apply the credit
  await applyCredit(referral.id, deployment.id, rewardAmount);
}

/**
 * Apply any pending referral rewards when a user's deployment becomes READY.
 * Returns the number of rewards applied.
 */
export async function applyPendingRewards(userId: string): Promise<number> {
  const pendingReferrals = await prisma.referral.findMany({
    where: { referrerId: userId, status: 'REWARD_PENDING' },
  });

  if (pendingReferrals.length === 0) return 0;

  const deployment = await prisma.openClawDeployment.findFirst({
    where: {
      userId,
      status: { in: ['READY', 'CANCELING'] },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!deployment) return 0;

  let applied = 0;
  for (const referral of pendingReferrals) {
    try {
      const wasApplied = await applyCredit(
        referral.id,
        deployment.id,
        Number(referral.rewardAmountUsd)
      );
      if (wasApplied) {
        applied++;
      }
    } catch (err: unknown) {
      console.error(
        `[referral] Failed to apply pending reward ${referral.id}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  return applied;
}

/**
 * Get referral stats for the account page.
 */
export async function getReferralStats(userId: string): Promise<{
  referralCode: string;
  totalReferred: number;
  totalRewarded: number;
  totalEarnedUsd: number;
  pendingRewards: number;
}> {
  const referralCode = await getOrCreateReferralCode(userId);

  const referrals = await prisma.referral.findMany({
    where: { referrerId: userId },
    select: { status: true, rewardAmountUsd: true },
  });

  const totalReferred = referrals.length;
  const totalRewarded = referrals.filter((r) => r.status === 'FULFILLED').length;
  const totalEarnedUsd = referrals
    .filter((r) => r.status === 'FULFILLED')
    .reduce((sum, r) => sum + Number(r.rewardAmountUsd), 0);
  const pendingRewards = referrals.filter(
    (r) => r.status === 'PENDING' || r.status === 'REWARD_PENDING'
  ).length;

  return { referralCode, totalReferred, totalRewarded, totalEarnedUsd, pendingRewards };
}

/**
 * Apply credit to a deployment and mark the referral as fulfilled.
 */
async function applyCredit(
  referralId: string,
  deploymentId: string,
  amountUsd: number
): Promise<boolean> {
  const { newBalance, shouldSendEmail } = await prisma.$transaction(async (tx) => {
    const referral = await tx.referral.findUnique({
      where: { id: referralId },
    });

    if (!referral) {
      throw new Error('Referral not found');
    }

    if (referral.status === 'FULFILLED') {
      return { newBalance: null, shouldSendEmail: false };
    }

    const deployment = await tx.openClawDeployment.findUnique({
      where: { id: deploymentId },
    });

    if (!deployment) {
      throw new Error('Deployment not found');
    }

    const updatedDeployment = await tx.openClawDeployment.update({
      where: { id: deploymentId },
      data: { creditBalanceUsd: { increment: amountUsd } },
      select: { creditBalanceUsd: true, openRouterKeyHash: true },
    });

    await tx.referral.update({
      where: { id: referralId },
      data: {
        status: 'FULFILLED',
        deploymentId,
        fulfilledAt: new Date(),
      },
    });

    return {
      newBalance: Number(updatedDeployment.creditBalanceUsd),
      shouldSendEmail: true,
      openRouterKeyHash: updatedDeployment.openRouterKeyHash,
    };
  });

  if (!shouldSendEmail || newBalance === null) {
    return false;
  }

  // Update OpenRouter key spending limit
  const deployment = await prisma.openClawDeployment.findUnique({
    where: { id: deploymentId },
    select: { openRouterKeyHash: true },
  });

  if (deployment?.openRouterKeyHash) {
    try {
      await openRouterService.updateKeyLimit(deployment.openRouterKeyHash, newBalance);
    } catch (err) {
      console.error(`[referral] Failed to update OpenRouter key limit:`, err);
    }
  }

  console.log(
    `[referral] Applied $${amountUsd} credit to deployment ${deploymentId} (referral ${referralId})`
  );

  // Send notification email to the referrer
  const referral = await prisma.referral.findUnique({
    where: { id: referralId },
    include: { referrer: { select: { email: true } } },
  });
  if (referral?.referrer.email) {
    try {
      await sendReferralRewardEmail(referral.referrer.email, amountUsd);
    } catch (emailErr: unknown) {
      console.error(
        '[referral] Failed to send reward email:',
        emailErr instanceof Error ? emailErr.message : emailErr
      );
    }
  }

  return true;
}
