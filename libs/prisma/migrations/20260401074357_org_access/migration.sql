-- AlterTable
ALTER TABLE "brand_kit" ADD COLUMN     "default" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "organization" ADD COLUMN     "access_codes" VARCHAR(20)[] DEFAULT ARRAY[]::VARCHAR(20)[];
