-- AlterTable: Add config versioning fields to OpenClawDeployment
ALTER TABLE "openclaw_deployments" ADD COLUMN "config_version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "openclaw_deployments" ADD COLUMN "soul_md" TEXT;
ALTER TABLE "openclaw_deployments" ADD COLUMN "last_update_at" TIMESTAMP(3);
ALTER TABLE "openclaw_deployments" ADD COLUMN "last_update_error" TEXT;

-- CreateTable: DeploymentUpdate (versioned update definitions)
CREATE TABLE "deployment_updates" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "commands" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deployment_updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable: DeploymentUpdateLog (per-deployment update application log)
CREATE TABLE "deployment_update_logs" (
    "id" TEXT NOT NULL,
    "deployment_id" TEXT NOT NULL,
    "update_version" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "output" TEXT,
    "error_message" TEXT,
    "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deployment_update_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "deployment_updates_version_key" ON "deployment_updates"("version");

-- CreateIndex
CREATE UNIQUE INDEX "deployment_update_logs_deployment_id_update_version_key" ON "deployment_update_logs"("deployment_id", "update_version");

-- CreateIndex
CREATE INDEX "deployment_update_logs_deployment_id_idx" ON "deployment_update_logs"("deployment_id");
