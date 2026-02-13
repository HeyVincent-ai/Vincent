-- Make safe_address required on polymarket_wallet_metadata.
-- All new POLYMARKET_WALLET secrets now deploy the Safe at creation time,
-- so safe_address is always populated.
--
-- PREREQUISITE: Run `npx tsx scripts/backfill-safe-addresses.ts` first
-- to deploy Safes for any existing rows with NULL safe_address.

-- Safety check: fail if any rows still have NULL safe_address
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "polymarket_wallet_metadata" WHERE safe_address IS NULL) THEN
    RAISE EXCEPTION 'Cannot apply migration: polymarket_wallet_metadata rows with NULL safe_address still exist. Run scripts/backfill-safe-addresses.ts first.';
  END IF;
END $$;

-- AlterTable
ALTER TABLE "polymarket_wallet_metadata" ALTER COLUMN "safe_address" SET NOT NULL;
