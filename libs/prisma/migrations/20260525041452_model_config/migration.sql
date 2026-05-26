-- AlterTable
ALTER TABLE "master_model_type" ADD COLUMN     "request_body_map" JSONB,
ADD COLUMN     "task_poll_api" TEXT,
ADD COLUMN     "task_poll_sec" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "task_response_map" JSONB;
