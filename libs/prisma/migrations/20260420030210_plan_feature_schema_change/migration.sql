/*
  Warnings:

  - You are about to drop the column `is_check` on the `plan_features` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "plan_features" DROP COLUMN "is_check",
ALTER COLUMN "category" SET DATA TYPE VARCHAR(200);
