-- AlterTable
ALTER TABLE "plan_prices" ADD COLUMN     "order_index" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "order_index" INTEGER NOT NULL DEFAULT 0;
