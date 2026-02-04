-- AlterEnum
ALTER TYPE "SecretType" ADD VALUE 'RAW_SIGNER';

-- CreateTable
CREATE TABLE "raw_signer_metadata" (
    "id" TEXT NOT NULL,
    "secret_id" TEXT NOT NULL,
    "eth_address" TEXT NOT NULL,
    "solana_address" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "raw_signer_metadata_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "raw_signer_metadata_secret_id_key" ON "raw_signer_metadata"("secret_id");

-- AddForeignKey
ALTER TABLE "raw_signer_metadata" ADD CONSTRAINT "raw_signer_metadata_secret_id_fkey" FOREIGN KEY ("secret_id") REFERENCES "secrets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
