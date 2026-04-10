/*
  Warnings:

  - You are about to drop the column `credit_allowance_snapshot` on the `organization_subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `image_allowance_snapshot` on the `organization_subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `plan_name_snapshot` on the `organization_subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `price_snapshot` on the `organization_subscriptions` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "organization_subscriptions" DROP COLUMN "credit_allowance_snapshot",
DROP COLUMN "image_allowance_snapshot",
DROP COLUMN "plan_name_snapshot",
DROP COLUMN "price_snapshot",
ADD COLUMN     "credit_allowance" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "image_allowance" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "plan_name" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "price" DECIMAL(10,2) NOT NULL DEFAULT 0;
