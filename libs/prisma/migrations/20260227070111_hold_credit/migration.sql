/*
  Warnings:

  - You are about to drop the column `package_cycle_balance` on the `credit_balances` table. All the data in the column will be lost.
  - You are about to drop the column `package_cycle_image` on the `credit_balances` table. All the data in the column will be lost.
  - Made the column `limit_credit_allowance` on table `project` required. This step will fail if there are existing NULL values in that column.
  - Made the column `limit_image_allowance` on table `project` required. This step will fail if there are existing NULL values in that column.
  - Made the column `used_credit_allowance` on table `project` required. This step will fail if there are existing NULL values in that column.
  - Made the column `used_image_allowance` on table `project` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "credit_balances" DROP COLUMN "package_cycle_balance",
DROP COLUMN "package_cycle_image",
ADD COLUMN     "hold_balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "hold_image" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "project" ADD COLUMN     "hold_credit_allowance" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "hold_image_allowance" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "limit_credit_allowance" SET NOT NULL,
ALTER COLUMN "limit_image_allowance" SET NOT NULL,
ALTER COLUMN "used_credit_allowance" SET NOT NULL,
ALTER COLUMN "used_image_allowance" SET NOT NULL;

-- AlterTable
ALTER TABLE "project_member" ADD COLUMN     "hold_credit_allowance" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "hold_image_allowance" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "used_credit_allowance" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "used_image_allowance" INTEGER NOT NULL DEFAULT 0;
