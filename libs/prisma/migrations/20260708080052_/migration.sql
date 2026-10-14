/*
  Warnings:

  - You are about to drop the column `llm_gateway_key` on the `invoice` table. All the data in the column will be lost.
  - You are about to drop the column `api_key` on the `organization` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "invoice" DROP COLUMN "llm_gateway_key";

-- AlterTable
ALTER TABLE "organization" DROP COLUMN "api_key",
ADD COLUMN     "llm_api_key" VARCHAR(100),
ADD COLUMN     "llm_organization_id" VARCHAR(100);
