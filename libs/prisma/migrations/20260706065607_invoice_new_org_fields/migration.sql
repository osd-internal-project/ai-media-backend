-- AlterTable
ALTER TABLE "invoice" ADD COLUMN     "is_new_organization" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "org_description" TEXT,
ADD COLUMN     "org_name" VARCHAR(150),
ADD COLUMN     "org_type" VARCHAR(50);

-- AlterTable
ALTER TABLE "organization" ADD COLUMN     "api_key" VARCHAR(100);
