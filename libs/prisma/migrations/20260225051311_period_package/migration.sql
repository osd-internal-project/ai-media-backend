/*
  Warnings:

  - Added the required column `next_billing_date` to the `organization_subscriptions` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "organization_subscriptions" ADD COLUMN     "next_billing_date" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "period" TEXT NOT NULL DEFAULT 'monthly',
ADD COLUMN     "period_count" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "period_current" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "plan_prices" ADD COLUMN     "period_count" INTEGER NOT NULL DEFAULT 1;
