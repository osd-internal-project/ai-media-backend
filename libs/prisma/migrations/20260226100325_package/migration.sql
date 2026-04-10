-- AlterTable
ALTER TABLE "organization_subscriptions" ADD COLUMN     "image_allowance_snapshot" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "plan_prices" ADD COLUMN     "image_allowance" DOUBLE PRECISION NOT NULL DEFAULT 0.00;
