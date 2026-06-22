-- AlterTable: เพิ่มคอลัมน์ที่ denormalize มาจาก log (metadata ระดับ request)
-- ทุกคอลัมน์ nullable / มี default เพื่อไม่ให้ row และ insert เดิมพัง
ALTER TABLE "gallery" ADD COLUMN     "referenceImages" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "resolution" TEXT,
ADD COLUMN     "ratio" TEXT,
ADD COLUMN     "generateAudio" BOOLEAN DEFAULT false,
ADD COLUMN     "tokenUsed" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "ImageUsed" INTEGER DEFAULT 0;

-- CreateIndex: เร่ง backfill ด้านล่าง + การ read ใหม่ที่ filter/distinct ด้วย taskId
CREATE INDEX IF NOT EXISTS "gallery_taskId_idx" ON "gallery"("taskId");

-- Backfill: เติม metadata จาก log ลงทุกแถว gallery ตาม taskId
-- log = 1 แถว/task, gallery = N แถว/task → ทุกแถวของ task เดียวกันได้ค่าชุดเดียวกัน (ตามดีไซน์ denormalize)
UPDATE "gallery" g
SET
  "referenceImages" = COALESCE(l."referenceImages", ARRAY[]::TEXT[]),
  "resolution"      = l."resolution",
  "ratio"           = l."ratio",
  "generateAudio"   = COALESCE(l."generateAudio", false),
  "tokenUsed"       = COALESCE(l."tokenUsed", 0),
  "ImageUsed"       = COALESCE(l."ImageUsed", 0)
FROM "log" l
WHERE g."taskId" IS NOT NULL
  AND g."taskId" = l."taskId";
