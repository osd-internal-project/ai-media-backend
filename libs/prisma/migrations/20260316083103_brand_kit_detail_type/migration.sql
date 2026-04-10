/*
  Warnings:

  - You are about to drop the `brand_kit_color` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "brand_kit_color" DROP CONSTRAINT "brand_kit_color_brand_kit_id_fkey";

-- DropTable
DROP TABLE "brand_kit_color";

-- CreateTable
CREATE TABLE "brand_kit_detail" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "detail" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "brand_kit_id" UUID,

    CONSTRAINT "brand_kit_detail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand_kit_detail_type" (
    "id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(100) NOT NULL,

    CONSTRAINT "brand_kit_detail_type_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "brand_kit_detail" ADD CONSTRAINT "brand_kit_detail_brand_kit_id_fkey" FOREIGN KEY ("brand_kit_id") REFERENCES "brand_kit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
