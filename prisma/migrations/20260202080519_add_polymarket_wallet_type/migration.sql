-- AlterEnum
ALTER TYPE "SecretType" ADD VALUE 'POLYMARKET_WALLET';

-- CreateTable
CREATE TABLE "polymarket_wallet_metadata" (
    "id" TEXT NOT NULL,
    "secret_id" TEXT NOT NULL,
    "eoa_address" TEXT NOT NULL,
    "safe_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "polymarket_wallet_metadata_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "polymarket_wallet_metadata_secret_id_key" ON "polymarket_wallet_metadata"("secret_id");

-- AddForeignKey
ALTER TABLE "polymarket_wallet_metadata" ADD CONSTRAINT "polymarket_wallet_metadata_secret_id_fkey" FOREIGN KEY ("secret_id") REFERENCES "secrets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
