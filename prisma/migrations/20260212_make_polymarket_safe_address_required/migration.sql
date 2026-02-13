-- Make safe_address required on polymarket_wallet_metadata.
-- All new POLYMARKET_WALLET secrets now deploy the Safe at creation time,
-- so safe_address is always populated. Any existing rows with NULL safe_address
-- should be cleaned up before running this migration.

-- Delete any polymarket wallet metadata rows that don't have a safe_address,
-- along with their parent secrets, since they are unusable.
DELETE FROM "secrets"
WHERE id IN (
  SELECT secret_id FROM "polymarket_wallet_metadata" WHERE safe_address IS NULL
);

-- AlterTable
ALTER TABLE "polymarket_wallet_metadata" ALTER COLUMN "safe_address" SET NOT NULL;
