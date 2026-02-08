-- CreateEnum
CREATE TYPE "OpenClawStatus" AS ENUM ('PENDING', 'ORDERING', 'PROVISIONING', 'INSTALLING', 'READY', 'ERROR', 'DESTROYING', 'DESTROYED');

-- CreateTable
CREATE TABLE "openclaw_deployments" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "ovh_service_name" TEXT,
    "ovh_order_id" TEXT,
    "ovh_cart_id" TEXT,
    "ip_address" TEXT,
    "access_token" TEXT,
    "ssh_private_key" TEXT,
    "ssh_public_key" TEXT,
    "open_router_key_hash" TEXT,
    "status" "OpenClawStatus" NOT NULL DEFAULT 'PENDING',
    "status_message" TEXT,
    "provision_log" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "ready_at" TIMESTAMP(3),
    "destroyed_at" TIMESTAMP(3),

    CONSTRAINT "openclaw_deployments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "openclaw_deployments_ovh_service_name_key" ON "openclaw_deployments"("ovh_service_name");

-- CreateIndex
CREATE INDEX "openclaw_deployments_user_id_idx" ON "openclaw_deployments"("user_id");

-- AddForeignKey
ALTER TABLE "openclaw_deployments" ADD CONSTRAINT "openclaw_deployments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
