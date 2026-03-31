-- CreateEnum
CREATE TYPE "ChatRole" AS ENUM ('user', 'assistant', 'system', 'tool');

-- CreateTable
CREATE TABLE "chat_conversation" (
    "id" UUID NOT NULL,
    "user_id" VARCHAR(50) NOT NULL,
    "organization_id" VARCHAR(50),
    "title" VARCHAR(300),
    "model" VARCHAR(100),
    "system_prompt" TEXT,
    "metadata" JSONB,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "chat_conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_message" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "role" "ChatRole" NOT NULL,
    "content" TEXT,
    "name" VARCHAR(100),
    "tool_call_id" VARCHAR(100),
    "tool_calls" JSONB,
    "metadata" JSONB,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_token_usage" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "message_id" UUID,
    "model" VARCHAR(100) NOT NULL,
    "prompt_tokens" INTEGER NOT NULL DEFAULT 0,
    "completion_tokens" INTEGER NOT NULL DEFAULT 0,
    "total_tokens" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_token_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_tool" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "parameters" JSONB NOT NULL,
    "handler" VARCHAR(100),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "chat_tool_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chat_conversation_user_id_idx" ON "chat_conversation"("user_id");

-- CreateIndex
CREATE INDEX "chat_conversation_organization_id_idx" ON "chat_conversation"("organization_id");

-- CreateIndex
CREATE INDEX "chat_message_conversation_id_idx" ON "chat_message"("conversation_id");

-- CreateIndex
CREATE UNIQUE INDEX "chat_token_usage_message_id_key" ON "chat_token_usage"("message_id");

-- CreateIndex
CREATE INDEX "chat_token_usage_conversation_id_idx" ON "chat_token_usage"("conversation_id");

-- CreateIndex
CREATE UNIQUE INDEX "chat_tool_name_key" ON "chat_tool"("name");

-- AddForeignKey
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "chat_conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_token_usage" ADD CONSTRAINT "chat_token_usage_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "chat_conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_token_usage" ADD CONSTRAINT "chat_token_usage_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "chat_message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
