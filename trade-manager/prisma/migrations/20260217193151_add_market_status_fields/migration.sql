-- AlterTable
ALTER TABLE monitored_positions ADD COLUMN endDate TEXT;
ALTER TABLE monitored_positions ADD COLUMN redeemable INTEGER NOT NULL DEFAULT 0;
