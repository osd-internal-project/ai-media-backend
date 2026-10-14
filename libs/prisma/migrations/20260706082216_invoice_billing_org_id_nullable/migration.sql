-- AlterTable
ALTER TABLE "billing_profile" ALTER COLUMN "organization_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "invoice" ALTER COLUMN "organization_id" DROP NOT NULL;
