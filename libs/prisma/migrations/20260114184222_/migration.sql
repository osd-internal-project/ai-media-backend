/*
  Warnings:

  - You are about to drop the column `password` on the `registers` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "registers" DROP COLUMN "password";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "agreement" BOOLEAN NOT NULL DEFAULT false;
