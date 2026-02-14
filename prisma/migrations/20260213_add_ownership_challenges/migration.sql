-- CreateTable
CREATE TABLE "ownership_challenges" (
    "id" TEXT NOT NULL,
    "secret_id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "challenge" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ownership_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ownership_challenges_secret_id_address_key" ON "ownership_challenges"("secret_id", "address");

-- AddForeignKey
ALTER TABLE "ownership_challenges" ADD CONSTRAINT "ownership_challenges_secret_id_fkey" FOREIGN KEY ("secret_id") REFERENCES "secrets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
