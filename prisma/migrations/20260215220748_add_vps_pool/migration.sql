-- CreateTable
CREATE TABLE "vps_pool" (
    "id" TEXT NOT NULL,
    "ovh_service_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vps_pool_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vps_pool_ovh_service_name_key" ON "vps_pool"("ovh_service_name");
