-- CreateEnum
CREATE TYPE "SecretType" AS ENUM ('EVM_WALLET', 'API_KEY', 'SSH_KEY', 'OAUTH_TOKEN');

-- CreateEnum
CREATE TYPE "PolicyType" AS ENUM ('ADDRESS_ALLOWLIST', 'FUNCTION_ALLOWLIST', 'TOKEN_ALLOWLIST', 'SPENDING_LIMIT_PER_TX', 'SPENDING_LIMIT_DAILY', 'SPENDING_LIMIT_WEEKLY', 'REQUIRE_APPROVAL', 'APPROVAL_THRESHOLD');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'EXECUTED', 'FAILED', 'TIMEOUT');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'CANCELED', 'PAST_DUE', 'TRIALING', 'INCOMPLETE');

-- CreateEnum
CREATE TYPE "AuditLogStatus" AS ENUM ('SUCCESS', 'FAILED', 'PENDING');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "stytch_user_id" TEXT,
    "telegram_username" TEXT,
    "telegram_chat_id" TEXT,
    "stripe_customer_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "secrets" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "type" "SecretType" NOT NULL,
    "value" TEXT,
    "memo" TEXT,
    "claim_token" TEXT,
    "claimed_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "secrets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_secret_metadata" (
    "id" TEXT NOT NULL,
    "secret_id" TEXT NOT NULL,
    "smart_account_address" TEXT NOT NULL,
    "chain_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallet_secret_metadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "secret_id" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policies" (
    "id" TEXT NOT NULL,
    "secret_id" TEXT NOT NULL,
    "policy_type" "PolicyType" NOT NULL,
    "policy_config" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_logs" (
    "id" TEXT NOT NULL,
    "secret_id" TEXT NOT NULL,
    "api_key_id" TEXT,
    "action_type" TEXT NOT NULL,
    "request_data" JSONB NOT NULL,
    "response_data" JSONB,
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "tx_hash" TEXT,
    "approved_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transaction_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pending_approvals" (
    "id" TEXT NOT NULL,
    "transaction_log_id" TEXT NOT NULL,
    "telegram_message_id" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "approved" BOOLEAN,
    "responded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pending_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "stripe_subscription_id" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "current_period_start" TIMESTAMP(3) NOT NULL,
    "current_period_end" TIMESTAMP(3) NOT NULL,
    "canceled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gas_usage" (
    "id" TEXT NOT NULL,
    "secret_id" TEXT NOT NULL,
    "user_id" TEXT,
    "transaction_hash" TEXT NOT NULL,
    "chain_id" INTEGER NOT NULL,
    "gas_used" BIGINT NOT NULL,
    "gas_price_gwei" DECIMAL(20,9) NOT NULL,
    "cost_usd" DECIMAL(20,8) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gas_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_gas_summaries" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "total_cost_usd" DECIMAL(20,8) NOT NULL,
    "billed" BOOLEAN NOT NULL DEFAULT false,
    "stripe_invoice_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monthly_gas_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "secret_id" TEXT,
    "api_key_id" TEXT,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "input_data" JSONB,
    "output_data" JSONB,
    "status" "AuditLogStatus" NOT NULL,
    "error_message" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "duration_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_stytch_user_id_key" ON "users"("stytch_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_stripe_customer_id_key" ON "users"("stripe_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "secrets_claim_token_key" ON "secrets"("claim_token");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_secret_metadata_secret_id_key" ON "wallet_secret_metadata"("secret_id");

-- CreateIndex
CREATE UNIQUE INDEX "pending_approvals_transaction_log_id_key" ON "pending_approvals"("transaction_log_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripe_subscription_id_key" ON "subscriptions"("stripe_subscription_id");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_gas_summaries_user_id_month_key" ON "monthly_gas_summaries"("user_id", "month");

-- CreateIndex
CREATE INDEX "audit_logs_secret_id_created_at_idx" ON "audit_logs"("secret_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_status_created_at_idx" ON "audit_logs"("status", "created_at");

-- AddForeignKey
ALTER TABLE "secrets" ADD CONSTRAINT "secrets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_secret_metadata" ADD CONSTRAINT "wallet_secret_metadata_secret_id_fkey" FOREIGN KEY ("secret_id") REFERENCES "secrets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_secret_id_fkey" FOREIGN KEY ("secret_id") REFERENCES "secrets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policies" ADD CONSTRAINT "policies_secret_id_fkey" FOREIGN KEY ("secret_id") REFERENCES "secrets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_logs" ADD CONSTRAINT "transaction_logs_secret_id_fkey" FOREIGN KEY ("secret_id") REFERENCES "secrets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_logs" ADD CONSTRAINT "transaction_logs_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_approvals" ADD CONSTRAINT "pending_approvals_transaction_log_id_fkey" FOREIGN KEY ("transaction_log_id") REFERENCES "transaction_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gas_usage" ADD CONSTRAINT "gas_usage_secret_id_fkey" FOREIGN KEY ("secret_id") REFERENCES "secrets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gas_usage" ADD CONSTRAINT "gas_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_gas_summaries" ADD CONSTRAINT "monthly_gas_summaries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_secret_id_fkey" FOREIGN KEY ("secret_id") REFERENCES "secrets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
