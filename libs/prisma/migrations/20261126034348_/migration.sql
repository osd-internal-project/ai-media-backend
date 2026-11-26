-- AlterTable
ALTER TABLE "organization" ADD COLUMN     "allowed_model_ids" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "allowed_model_ids" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
