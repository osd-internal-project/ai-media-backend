/*
  Warnings:

  - You are about to drop the column `image_paths` on the `prompt_guide` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "prompt_guide" DROP COLUMN "image_paths";

-- AlterTable
ALTER TABLE "prompt_guide_images" ADD COLUMN     "prompt_guide_id" INTEGER;

-- AddForeignKey
ALTER TABLE "prompt_guide_images" ADD CONSTRAINT "prompt_guide_images_prompt_guide_id_fkey" FOREIGN KEY ("prompt_guide_id") REFERENCES "prompt_guide"("id") ON DELETE SET NULL ON UPDATE CASCADE;
