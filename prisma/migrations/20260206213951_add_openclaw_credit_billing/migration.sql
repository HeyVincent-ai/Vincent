-- AlterTable
ALTER TABLE "openclaw_deployments" ADD COLUMN     "credit_balance_usd" DECIMAL(10,2) NOT NULL DEFAULT 25.00,
ADD COLUMN     "last_known_usage_usd" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "last_usage_poll_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "openclaw_credit_purchases" (
    "id" TEXT NOT NULL,
    "deployment_id" TEXT NOT NULL,
    "amount_usd" DECIMAL(10,2) NOT NULL,
    "stripe_payment_intent_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "openclaw_credit_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "openclaw_credit_purchases_stripe_payment_intent_id_key" ON "openclaw_credit_purchases"("stripe_payment_intent_id");

-- CreateIndex
CREATE INDEX "openclaw_credit_purchases_deployment_id_idx" ON "openclaw_credit_purchases"("deployment_id");

-- AddForeignKey
ALTER TABLE "openclaw_credit_purchases" ADD CONSTRAINT "openclaw_credit_purchases_deployment_id_fkey" FOREIGN KEY ("deployment_id") REFERENCES "openclaw_deployments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
