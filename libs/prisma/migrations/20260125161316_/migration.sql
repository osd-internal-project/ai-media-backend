/*
  Warnings:

  - You are about to drop the column `imageName` on the `ref_images` table. All the data in the column will be lost.
  - You are about to drop the column `imagePath` on the `ref_images` table. All the data in the column will be lost.
  - You are about to drop the column `imageSize` on the `ref_images` table. All the data in the column will be lost.
  - You are about to drop the column `imageType` on the `ref_images` table. All the data in the column will be lost.
  - You are about to drop the column `projectId` on the `ref_images` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `ref_images` table. All the data in the column will be lost.
  - Added the required column `generate_type` to the `ref_images` table without a default value. This is not possible if the table is not empty.
  - Added the required column `image_name` to the `ref_images` table without a default value. This is not possible if the table is not empty.
  - Added the required column `image_path` to the `ref_images` table without a default value. This is not possible if the table is not empty.
  - Added the required column `image_type` to the `ref_images` table without a default value. This is not possible if the table is not empty.
  - Added the required column `project_id` to the `ref_images` table without a default value. This is not possible if the table is not empty.
  - Added the required column `user_id` to the `ref_images` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ref_images" DROP COLUMN "imageName",
DROP COLUMN "imagePath",
DROP COLUMN "imageSize",
DROP COLUMN "imageType",
DROP COLUMN "projectId",
DROP COLUMN "userId",
ADD COLUMN     "generate_type" VARCHAR(50) NOT NULL,
ADD COLUMN     "image_name" VARCHAR(200) NOT NULL,
ADD COLUMN     "image_path" VARCHAR(200) NOT NULL,
ADD COLUMN     "image_size" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "image_type" VARCHAR(50) NOT NULL,
ADD COLUMN     "project_id" VARCHAR(100) NOT NULL,
ADD COLUMN     "user_id" VARCHAR(50) NOT NULL;
