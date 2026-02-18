-- Add referral code to users
ALTER TABLE "users" ADD COLUMN "referral_code" TEXT;
CREATE UNIQUE INDEX "users_referral_code_key" ON "users"("referral_code");

-- Referral status enum
CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'REWARD_PENDING', 'FULFILLED');

-- Referral tracking table
CREATE TABLE "referrals" (
  "id" TEXT NOT NULL,
  "referrer_id" TEXT NOT NULL,
  "referred_user_id" TEXT NOT NULL,
  "status" "ReferralStatus" NOT NULL DEFAULT 'PENDING',
  "reward_amount_usd" DECIMAL(10,2) NOT NULL DEFAULT 10.00,
  "deployment_id" TEXT,
  "fulfilled_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "referrals_referred_user_id_key" ON "referrals"("referred_user_id");
CREATE INDEX "referrals_referrer_id_idx" ON "referrals"("referrer_id");
CREATE INDEX "referrals_status_idx" ON "referrals"("status");

ALTER TABLE "referrals"
  ADD CONSTRAINT "referrals_referrer_id_fkey"
  FOREIGN KEY ("referrer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "referrals"
  ADD CONSTRAINT "referrals_referred_user_id_fkey"
  FOREIGN KEY ("referred_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
