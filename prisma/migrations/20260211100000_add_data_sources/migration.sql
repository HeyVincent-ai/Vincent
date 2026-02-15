-- AlterEnum
ALTER TYPE "SecretType" ADD VALUE 'DATA_SOURCES';

-- AlterTable
ALTER TABLE "users" ADD COLUMN "data_source_credit_usd" DECIMAL(10,2) NOT NULL DEFAULT 10.00;

-- CreateTable
CREATE TABLE "data_source_usage" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "secret_id" TEXT NOT NULL,
    "api_key_id" TEXT,
    "data_source" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "cost_usd" DECIMAL(10,6) NOT NULL,
    "request_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_source_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_source_credit_purchases" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "amount_usd" DECIMAL(10,2) NOT NULL,
    "stripe_payment_intent_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_source_credit_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "data_source_usage_user_id_created_at_idx" ON "data_source_usage"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "data_source_usage_secret_id_created_at_idx" ON "data_source_usage"("secret_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "data_source_credit_purchases_stripe_payment_intent_id_key" ON "data_source_credit_purchases"("stripe_payment_intent_id");

-- CreateIndex
CREATE INDEX "data_source_credit_purchases_user_id_idx" ON "data_source_credit_purchases"("user_id");

-- AddForeignKey
ALTER TABLE "data_source_usage" ADD CONSTRAINT "data_source_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_source_usage" ADD CONSTRAINT "data_source_usage_secret_id_fkey" FOREIGN KEY ("secret_id") REFERENCES "secrets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_source_credit_purchases" ADD CONSTRAINT "data_source_credit_purchases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
