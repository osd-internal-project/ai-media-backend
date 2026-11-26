-- AlterTable
ALTER TABLE "brand_kit" ADD COLUMN     "custom_prompt" TEXT,
ADD COLUMN     "prompt_version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "style" JSONB;

-- AlterTable
ALTER TABLE "brand_kit_detail" ADD COLUMN     "include_in_prompt" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "sort_order" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "gallery" ADD COLUMN     "brand_kit_id" UUID;

-- AlterTable
ALTER TABLE "project" ADD COLUMN     "brand_kit_id" UUID;

-- CreateIndex
CREATE INDEX "brand_kit_organization_id_idx" ON "brand_kit"("organization_id");

-- CreateIndex
CREATE INDEX "brand_kit_detail_brand_kit_id_type_idx" ON "brand_kit_detail"("brand_kit_id", "type");

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_brand_kit_id_fkey" FOREIGN KEY ("brand_kit_id") REFERENCES "brand_kit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
