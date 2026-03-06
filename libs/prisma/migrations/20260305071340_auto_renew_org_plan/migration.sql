-- AlterTable
ALTER TABLE "organization_subscriptions" ADD COLUMN     "auto_renew" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "next_plan_id" UUID;
