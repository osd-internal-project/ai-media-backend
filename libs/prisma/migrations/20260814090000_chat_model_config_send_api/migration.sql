-- AlterTable
-- send_api ปล่อยว่างไว้โดยตั้งใจ: แถวเดิมจะตกไปใช้ค่าจาก env เหมือนเดิม
-- (LLM_CHAT_BASE_URL / LLM_GATEWAY_URL) ทำให้ local/sit/uat/prod ที่ชี้คนละ gateway
-- ยังทำงานได้ทันทีหลัง migrate โดยไม่ต้องแก้ข้อมูล
ALTER TABLE "chat_model_config" ADD COLUMN     "send_api" TEXT NOT NULL DEFAULT '';
ALTER TABLE "chat_model_config" ADD COLUMN     "send_config" JSONB;
