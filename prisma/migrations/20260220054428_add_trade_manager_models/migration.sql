-- CreateEnum
CREATE TYPE "TradeRuleType" AS ENUM ('STOP_LOSS', 'TAKE_PROFIT', 'TRAILING_STOP');

-- CreateEnum
CREATE TYPE "TradeRuleStatus" AS ENUM ('ACTIVE', 'TRIGGERED', 'CANCELED', 'EXPIRED', 'FAILED');

-- CreateEnum
CREATE TYPE "TradeRuleEventType" AS ENUM ('RULE_CREATED', 'RULE_EVALUATED', 'RULE_TRIGGERED', 'RULE_FAILED', 'RULE_CANCELED', 'RULE_TRAILING_UPDATED', 'ACTION_ATTEMPT', 'ACTION_EXECUTED', 'ACTION_FAILED');

-- CreateTable
CREATE TABLE "trade_rules" (
    "id" TEXT NOT NULL,
    "secret_id" TEXT NOT NULL,
    "rule_type" "TradeRuleType" NOT NULL,
    "market_id" TEXT NOT NULL,
    "market_slug" TEXT,
    "token_id" TEXT NOT NULL,
    "side" TEXT NOT NULL DEFAULT 'BUY',
    "trigger_price" DOUBLE PRECISION NOT NULL,
    "trailing_percent" DOUBLE PRECISION,
    "action" TEXT NOT NULL,
    "status" "TradeRuleStatus" NOT NULL DEFAULT 'ACTIVE',
    "triggered_at" TIMESTAMP(3),
    "trigger_tx_hash" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trade_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trade_monitored_positions" (
    "id" TEXT NOT NULL,
    "secret_id" TEXT NOT NULL,
    "market_id" TEXT NOT NULL,
    "market_slug" TEXT,
    "token_id" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "avg_entry_price" DOUBLE PRECISION,
    "current_price" DOUBLE PRECISION NOT NULL,
    "market_title" TEXT,
    "outcome" TEXT,
    "end_date" TEXT,
    "redeemable" BOOLEAN NOT NULL DEFAULT false,
    "last_updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trade_monitored_positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trade_rule_events" (
    "id" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "event_type" "TradeRuleEventType" NOT NULL,
    "event_data" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trade_rule_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trade_rules_secret_id_status_idx" ON "trade_rules"("secret_id", "status");

-- CreateIndex
CREATE INDEX "trade_rules_status_idx" ON "trade_rules"("status");

-- CreateIndex
CREATE INDEX "trade_rules_token_id_idx" ON "trade_rules"("token_id");

-- CreateIndex
CREATE UNIQUE INDEX "trade_monitored_positions_secret_id_market_id_token_id_side_key" ON "trade_monitored_positions"("secret_id", "market_id", "token_id", "side");

-- CreateIndex
CREATE INDEX "trade_rule_events_rule_id_created_at_idx" ON "trade_rule_events"("rule_id", "created_at");

-- AddForeignKey
ALTER TABLE "trade_rules" ADD CONSTRAINT "trade_rules_secret_id_fkey" FOREIGN KEY ("secret_id") REFERENCES "secrets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trade_monitored_positions" ADD CONSTRAINT "trade_monitored_positions_secret_id_fkey" FOREIGN KEY ("secret_id") REFERENCES "secrets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trade_rule_events" ADD CONSTRAINT "trade_rule_events_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "trade_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
