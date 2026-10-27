-- AlterTable
ALTER TABLE "gallery" ADD COLUMN     "provider_task_id" TEXT;

-- AlterTable
ALTER TABLE "log" ADD COLUMN     "provider_task_id" TEXT;

-- CreateIndex
CREATE INDEX "gallery_provider_task_id_idx" ON "gallery"("provider_task_id");
