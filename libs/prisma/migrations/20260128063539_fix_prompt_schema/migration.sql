-- DropForeignKey
ALTER TABLE "prompt_guide_images" DROP CONSTRAINT "prompt_guide_images_prompt_guide_id_fkey";

-- AlterTable
ALTER TABLE "prompt_guide" ADD COLUMN     "prompt_guide_images" TEXT[] DEFAULT ARRAY[]::TEXT[];
