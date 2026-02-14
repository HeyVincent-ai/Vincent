-- AlterTable
ALTER TABLE "wallet_secret_metadata" ADD COLUMN     "chains_transferred" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
