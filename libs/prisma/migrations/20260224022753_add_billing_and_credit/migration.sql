/*
  Warnings:

  - A unique constraint covering the columns `[organization_id,user_id]` on the table `organization_member` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "plan_prices_plan_id_period_key";

-- AlterTable
ALTER TABLE "plan_prices" ADD COLUMN     "credit_allowance" DOUBLE PRECISION NOT NULL DEFAULT 0.00,
ADD COLUMN     "currency" VARCHAR(3) NOT NULL DEFAULT 'THB',
ADD COLUMN     "duration_days" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "interval" VARCHAR(20) NOT NULL DEFAULT 'MONTH',
ADD COLUMN     "is_default" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "organization_subscriptions" (
    "id" UUID NOT NULL,
    "organization_id" VARCHAR(50) NOT NULL,
    "plan_id" UUID NOT NULL,
    "plan_name_snapshot" TEXT NOT NULL,
    "price_snapshot" DECIMAL(10,2) NOT NULL,
    "interval" VARCHAR(50),
    "credit_allowance_snapshot" DOUBLE PRECISION NOT NULL,
    "current_period_start" TIMESTAMP(3) NOT NULL,
    "current_period_end" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_balances" (
    "id" UUID NOT NULL,
    "organization_id" VARCHAR(50) NOT NULL,
    "current_cycle_balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "on_top_balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "package_transactions" (
    "id" UUID NOT NULL,
    "organization_id" VARCHAR(50) NOT NULL,
    "amountPaid" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'THB',
    "status" TEXT NOT NULL DEFAULT 'WAIT',
    "payment_method" TEXT,
    "paid_at" TIMESTAMP(3),
    "expired_payment_at" TIMESTAMP(3),
    "plan_name" TEXT NOT NULL,
    "plan_interval" TEXT NOT NULL,
    "billing_period_start" TIMESTAMP(3) NOT NULL,
    "billing_period_end" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "package_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organization_subscriptions_organization_id_key" ON "organization_subscriptions"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "credit_balances_organization_id_key" ON "credit_balances"("organization_id");
 
-- AddForeignKey
ALTER TABLE "organization_subscriptions" ADD CONSTRAINT "organization_subscriptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_subscriptions" ADD CONSTRAINT "organization_subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_balances" ADD CONSTRAINT "credit_balances_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_transactions" ADD CONSTRAINT "package_transactions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
