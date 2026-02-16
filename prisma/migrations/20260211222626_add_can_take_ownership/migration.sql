-- AlterTable
ALTER TABLE "wallet_secret_metadata" ADD COLUMN     "can_take_ownership" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "chains_used" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "owner_address" TEXT,
ADD COLUMN     "ownership_transferred" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "transfer_tx_hash" TEXT,
ADD COLUMN     "transferred_at" TIMESTAMP(3);
