-- CreateTable
CREATE TABLE "polymarket_credentials" (
    "id" TEXT NOT NULL,
    "secret_id" TEXT NOT NULL,
    "eoa_address" TEXT NOT NULL,
    "api_key" TEXT NOT NULL,
    "api_secret" TEXT NOT NULL,
    "passphrase" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "polymarket_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "polymarket_credentials_secret_id_key" ON "polymarket_credentials"("secret_id");

-- AddForeignKey
ALTER TABLE "polymarket_credentials" ADD CONSTRAINT "polymarket_credentials_secret_id_fkey" FOREIGN KEY ("secret_id") REFERENCES "secrets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
