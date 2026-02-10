/*
  Warnings:

  - A unique constraint covering the columns `[uid]` on the table `ref_images` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `uid` to the `ref_images` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ref_images" ADD COLUMN     "uid" VARCHAR(50) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "ref_images_uid_key" ON "ref_images"("uid");
