/*
  Warnings:

  - You are about to alter the column `plan_name` on the `package_transactions` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(50)`.
  - You are about to alter the column `plan_interval` on the `package_transactions` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(20)`.

*/
-- AlterTable
ALTER TABLE "package_transactions" ADD COLUMN     "plan_id" VARCHAR(50),
ALTER COLUMN "plan_name" SET DATA TYPE VARCHAR(50),
ALTER COLUMN "plan_interval" SET DATA TYPE VARCHAR(20);
