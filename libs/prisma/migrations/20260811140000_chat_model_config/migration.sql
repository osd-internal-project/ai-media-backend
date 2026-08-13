-- AlterTable
ALTER TABLE "organization" ADD COLUMN     "llm_gateway_host" VARCHAR(200);

-- CreateTable
CREATE TABLE "chat_model_config" (
    "id" UUID NOT NULL,
    "model_id" VARCHAR(120) NOT NULL,
    "display_name" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "temperature" DECIMAL(3,2) NOT NULL DEFAULT 0.7,
    "max_tokens" INTEGER NOT NULL DEFAULT 1000,
    "supports_vision" BOOLEAN NOT NULL DEFAULT false,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "chat_model_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "chat_model_config_model_id_key" ON "chat_model_config"("model_id");

-- CreateIndex
CREATE INDEX "chat_model_config_is_active_sort_order_idx" ON "chat_model_config"("is_active", "sort_order");

-- Seed the models the gateway serves today. gen_random_uuid() ships with
-- PostgreSQL 13+ (pgcrypto not required).
INSERT INTO "chat_model_config"
  ("id", "model_id", "display_name", "description", "temperature", "max_tokens", "supports_vision", "is_default", "is_active", "sort_order", "updated_at")
VALUES
  (gen_random_uuid(), 'llama3.3-70b', 'Llama 3.3 70B', 'General purpose, strong at long-form prompt writing.', 0.7, 1000, false, true, true, 10, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'gemini-2.5-flash-lite', 'Gemini 2.5 Flash Lite', 'Fastest option. Good for quick prompt iterations.', 0.7, 1000, true, false, true, 20, CURRENT_TIMESTAMP)
ON CONFLICT ("model_id") DO NOTHING;
