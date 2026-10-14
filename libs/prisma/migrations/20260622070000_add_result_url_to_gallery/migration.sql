-- AlterTable: เพิ่มคอลัมน์ resultUrl เก็บ object name ของ output ทุกรูปใน generation เดียว
-- nullable-safe ด้วย default [] เพื่อไม่ให้ row และ insert เดิมพัง (row เก่า resultUrl = [] แล้ว fallback ไป imageUrl)
ALTER TABLE "gallery" ADD COLUMN     "resultUrl" TEXT[] DEFAULT ARRAY[]::TEXT[];
