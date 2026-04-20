-- AlterTable
ALTER TABLE "plan_features" ADD COLUMN     "is_check" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "category" SET DEFAULT '';
