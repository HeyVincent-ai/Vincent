/*
  Warnings:

  - You are about to drop the column `chain_id` on the `wallet_secret_metadata` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "wallet_secret_metadata" DROP COLUMN "chain_id";
