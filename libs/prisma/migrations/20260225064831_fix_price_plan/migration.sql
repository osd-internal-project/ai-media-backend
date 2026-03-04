/*
  Warnings:

  - You are about to drop the column `duration_days` on the `plan_prices` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "plan_prices" DROP COLUMN "duration_days",
ADD COLUMN     "duration" INTEGER NOT NULL DEFAULT 0;
