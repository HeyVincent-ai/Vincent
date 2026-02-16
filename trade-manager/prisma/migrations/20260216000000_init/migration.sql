-- CreateTable
CREATE TABLE "trade_rules" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ruleType" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "triggerPrice" REAL NOT NULL,
    "trailingPercent" REAL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "triggeredAt" DATETIME,
    "triggerTxHash" TEXT,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "monitored_positions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "marketId" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "avgEntryPrice" REAL,
    "currentPrice" REAL NOT NULL,
    "lastUpdatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "rule_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ruleId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventData" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rule_events_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "trade_rules" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "config" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "trade_rules_status_idx" ON "trade_rules"("status");
CREATE INDEX "trade_rules_marketId_tokenId_idx" ON "trade_rules"("marketId", "tokenId");
CREATE UNIQUE INDEX "monitored_positions_marketId_tokenId_side_key" ON "monitored_positions"("marketId", "tokenId", "side");
CREATE INDEX "monitored_positions_marketId_tokenId_idx" ON "monitored_positions"("marketId", "tokenId");
CREATE INDEX "rule_events_ruleId_createdAt_idx" ON "rule_events"("ruleId", "createdAt");
