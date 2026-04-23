/*
  Warnings:

  - Added the required column `type` to the `master_model_option` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "master_model_option" ADD COLUMN     "type" VARCHAR(150) NOT NULL;
