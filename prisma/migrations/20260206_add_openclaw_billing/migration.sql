-- AlterEnum
ALTER TYPE "OpenClawStatus" ADD VALUE 'PENDING_PAYMENT' BEFORE 'PENDING';
ALTER TYPE "OpenClawStatus" ADD VALUE 'CANCELING' AFTER 'READY';

-- AlterTable
ALTER TABLE "openclaw_deployments" ADD COLUMN "stripe_subscription_id" TEXT,
ADD COLUMN "current_period_end" TIMESTAMP(3),
ADD COLUMN "canceled_at" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "openclaw_deployments_stripe_subscription_id_key" ON "openclaw_deployments"("stripe_subscription_id");
