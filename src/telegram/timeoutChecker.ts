import prisma from '../db/client';
import { sendNotification } from './bot';

let intervalId: ReturnType<typeof setInterval> | null = null;

const CHECK_INTERVAL_MS = 60 * 1000; // Check every minute

/**
 * Start a periodic job that expires pending approvals past their deadline.
 */
export function startTimeoutChecker(): void {
  if (intervalId) return;

  intervalId = setInterval(async () => {
    try {
      await expireTimedOutApprovals();
    } catch (error) {
      console.error('Error in approval timeout checker:', error);
    }
  }, CHECK_INTERVAL_MS);

  console.log('Approval timeout checker started');
}

/**
 * Stop the periodic timeout checker.
 */
export function stopTimeoutChecker(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

/**
 * Find and expire all pending approvals that have passed their expiresAt.
 */
async function expireTimedOutApprovals(): Promise<void> {
  const expired = await prisma.pendingApproval.findMany({
    where: {
      approved: null, // still pending
      expiresAt: { lt: new Date() },
    },
    include: {
      transactionLog: {
        include: {
          secret: { include: { user: true } },
        },
      },
    },
  });

  for (const approval of expired) {
    // Mark as denied (timed out)
    await prisma.pendingApproval.update({
      where: { id: approval.id },
      data: {
        approved: false,
        respondedAt: new Date(),
      },
    });

    await prisma.transactionLog.update({
      where: { id: approval.transactionLogId },
      data: { status: 'TIMEOUT' },
    });

    // Notify user if possible
    const userId = approval.transactionLog.secret.userId;
    if (userId) {
      await sendNotification(
        userId,
        `Approval request for ${approval.transactionLog.actionType} has expired and was automatically denied.`
      );
    }
  }

  if (expired.length > 0) {
    console.log(`Expired ${expired.length} timed-out approval(s)`);
  }
}
