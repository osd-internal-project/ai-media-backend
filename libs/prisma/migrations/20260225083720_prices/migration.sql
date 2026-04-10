/*
  Warnings:

  - You are about to drop the column `period` on the `plan_prices` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "plan_prices" DROP COLUMN "period",
ADD COLUMN     "periodUnit" VARCHAR(20);
