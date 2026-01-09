/*
  Warnings:

  - You are about to drop the column `available_image_amount` on the `organization_member` table. All the data in the column will be lost.
  - You are about to drop the column `available_token_amount` on the `organization_member` table. All the data in the column will be lost.
  - You are about to drop the column `remain_image_amount` on the `organization_member` table. All the data in the column will be lost.
  - You are about to drop the column `remain_token_amount` on the `organization_member` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "organization" ADD COLUMN     "remain_image_amount" INTEGER DEFAULT 0,
ADD COLUMN     "remain_token_amount" INTEGER DEFAULT 0;

-- AlterTable
ALTER TABLE "organization_member" DROP COLUMN "available_image_amount",
DROP COLUMN "available_token_amount",
DROP COLUMN "remain_image_amount",
DROP COLUMN "remain_token_amount";

-- AlterTable
ALTER TABLE "project" ADD COLUMN     "access_image_amount" INTEGER DEFAULT 0,
ADD COLUMN     "access_token_amount" INTEGER DEFAULT 0,
ADD COLUMN     "remain_image_amount" INTEGER DEFAULT 0,
ADD COLUMN     "remain_token_amount" INTEGER DEFAULT 0;
