-- AlterTable
ALTER TABLE "credit_balances" ADD COLUMN     "current_cycle_image" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "on_top_image" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "package_cycle_balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "package_cycle_image" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "gallery" ADD COLUMN     "used_credit" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "used_image" INTEGER DEFAULT 0;

-- AlterTable
ALTER TABLE "log" ADD COLUMN     "used_credit" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "used_image" INTEGER DEFAULT 0;

-- AlterTable
ALTER TABLE "project" ADD COLUMN     "limit_credit_allowance" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "limit_image_allowance" INTEGER DEFAULT 0,
ADD COLUMN     "used_credit_allowance" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "used_image_allowance" INTEGER DEFAULT 0;

-- AlterTable
ALTER TABLE "project_member" ADD COLUMN     "limit_credit_allowance" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "limit_image_allowance" INTEGER DEFAULT 0;
