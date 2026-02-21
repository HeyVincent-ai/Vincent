import { Decimal } from '@prisma/client/runtime/library';
import prisma from '../db/client.js';
import { AppError } from '../api/middleware/errorHandler.js';

/**
 * Atomically deduct credit from user's data source balance.
 * Uses UPDATE ... RETURNING for a single round-trip.
 * Throws 402 if insufficient credit.
 */
export async function deductCredit(userId: string, costUsd: number): Promise<Decimal> {
  const cost = new Decimal(costUsd);

  const rows = await prisma.$queryRaw<{ data_source_credit_usd: Decimal }[]>`
    UPDATE "users"
    SET "data_source_credit_usd" = "data_source_credit_usd" - ${cost}
    WHERE "id" = ${userId}
      AND "data_source_credit_usd" >= ${cost}
    RETURNING "data_source_credit_usd"
  `;

  if (rows.length === 0) {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    throw new AppError(
      'INSUFFICIENT_CREDIT',
      `Insufficient data source credit. Balance: $${user.dataSourceCreditUsd.toFixed(2)}, required: $${costUsd.toFixed(4)}`,
      402,
      { balance: user.dataSourceCreditUsd.toNumber(), required: costUsd }
    );
  }

  return new Decimal(rows[0].data_source_credit_usd);
}

/**
 * Get user's current data source credit balance.
 */
export async function getBalance(userId: string): Promise<Decimal> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return user.dataSourceCreditUsd;
}

/**
 * Add credits to user's data source balance and record the purchase.
 */
export async function addCredits(
  userId: string,
  amountUsd: number,
  stripePaymentIntentId: string
): Promise<Decimal> {
  const amount = new Decimal(amountUsd);

  const [user] = await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        dataSourceCreditUsd: { increment: amount },
      },
    }),
    prisma.dataSourceCreditPurchase.create({
      data: {
        userId,
        amountUsd: amount,
        stripePaymentIntentId,
      },
    }),
  ]);

  return user.dataSourceCreditUsd;
}

/**
 * Refund credit to user's data source balance (e.g., after a failed API call).
 * Throws if the user doesn't exist (prevents silent no-op).
 */
export async function refundCredit(userId: string, costUsd: number): Promise<void> {
  const cost = new Decimal(costUsd);
  await prisma.user.update({
    where: { id: userId },
    data: { dataSourceCreditUsd: { increment: cost } },
  });
}

/**
 * List credit purchases for a user.
 */
export async function getCreditPurchases(userId: string) {
  return prisma.dataSourceCreditPurchase.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
}
