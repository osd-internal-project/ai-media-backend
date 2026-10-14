-- AlterTable
ALTER TABLE "gallery" ADD COLUMN     "feature_type" VARCHAR(50) NOT NULL DEFAULT 'chat',
ADD COLUMN     "ref_feature_id" VARCHAR(100);

-- AlterTable
ALTER TABLE "log" ADD COLUMN     "feature_type" VARCHAR(50) NOT NULL DEFAULT 'chat',
ADD COLUMN     "ref_feature_id" VARCHAR(100);

-- CreateTable
CREATE TABLE "workflow_conversation" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_block" (
    "id" TEXT NOT NULL,
    "workflow_conversation_id" TEXT NOT NULL,
    "parent_block_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "type" VARCHAR(20) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "prompt" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "resolution" TEXT NOT NULL,
    "generate_config" JSONB,
    "task_id" TEXT,
    "output_url" TEXT,
    "error_message" TEXT,
    "position_x" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "position_y" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "duration" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_block_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "workflow_conversation" ADD CONSTRAINT "workflow_conversation_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_block" ADD CONSTRAINT "workflow_block_workflow_conversation_id_fkey" FOREIGN KEY ("workflow_conversation_id") REFERENCES "workflow_conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
