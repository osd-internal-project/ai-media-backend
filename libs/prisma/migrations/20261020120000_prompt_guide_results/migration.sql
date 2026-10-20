-- AlterTable
ALTER TABLE "prompt_guide" ADD COLUMN "prompt_guide_results" TEXT[] DEFAULT ARRAY[]::TEXT[];
