-- CreateTable
CREATE TABLE "social_account" (
    "id" UUID NOT NULL,
    "organization_id" VARCHAR(50) NOT NULL,
    "platform" VARCHAR(20) NOT NULL,
    "external_id" VARCHAR(100) NOT NULL,
    "display_name" VARCHAR(200) NOT NULL,
    "avatar_url" VARCHAR(500),
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT,
    "token_expires_at" TIMESTAMPTZ(6),
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "connected_by_user_id" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "social_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_share" (
    "id" UUID NOT NULL,
    "organization_id" VARCHAR(50) NOT NULL,
    "project_id" TEXT NOT NULL,
    "created_by_user_id" VARCHAR(50) NOT NULL,
    "caption" TEXT NOT NULL DEFAULT '',
    "hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "link_url" VARCHAR(500),
    "media_items" JSONB NOT NULL DEFAULT '[]',
    "status" VARCHAR(20) NOT NULL DEFAULT 'NEW',
    "reviewed_by_user_id" VARCHAR(50),
    "reviewed_at" TIMESTAMPTZ(6),
    "review_note" TEXT,
    "scheduled_at" TIMESTAMPTZ(6),
    "sent_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "activity_share_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_share_target" (
    "id" UUID NOT NULL,
    "activity_share_id" UUID NOT NULL,
    "social_account_id" UUID NOT NULL,
    "platform" VARCHAR(20) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "remote_post_id" VARCHAR(200),
    "remote_url" VARCHAR(500),
    "error_code" VARCHAR(50),
    "error_message" TEXT,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "activity_share_target_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_share_log" (
    "id" UUID NOT NULL,
    "activity_share_id" UUID NOT NULL,
    "activity_share_target_id" UUID,
    "action" VARCHAR(30) NOT NULL,
    "from_status" VARCHAR(20),
    "to_status" VARCHAR(20) NOT NULL,
    "action_user_id" VARCHAR(50),
    "actor_type" VARCHAR(20) NOT NULL DEFAULT 'USER',
    "note" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_share_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "social_account_organization_id_idx" ON "social_account"("organization_id");

-- CreateIndex
CREATE INDEX "social_account_status_idx" ON "social_account"("status");

-- CreateIndex
CREATE UNIQUE INDEX "social_account_organization_id_platform_external_id_key" ON "social_account"("organization_id", "platform", "external_id");

-- CreateIndex
CREATE INDEX "activity_share_organization_id_status_idx" ON "activity_share"("organization_id", "status");

-- CreateIndex
CREATE INDEX "activity_share_project_id_idx" ON "activity_share"("project_id");

-- CreateIndex
CREATE INDEX "activity_share_status_idx" ON "activity_share"("status");

-- CreateIndex
CREATE INDEX "activity_share_created_by_user_id_idx" ON "activity_share"("created_by_user_id");

-- CreateIndex
CREATE INDEX "activity_share_target_activity_share_id_idx" ON "activity_share_target"("activity_share_id");

-- CreateIndex
CREATE INDEX "activity_share_target_status_idx" ON "activity_share_target"("status");

-- CreateIndex
CREATE UNIQUE INDEX "activity_share_target_activity_share_id_social_account_id_key" ON "activity_share_target"("activity_share_id", "social_account_id");

-- CreateIndex
CREATE INDEX "activity_share_log_activity_share_id_created_at_idx" ON "activity_share_log"("activity_share_id", "created_at");

-- CreateIndex
CREATE INDEX "activity_share_log_action_idx" ON "activity_share_log"("action");

-- AddForeignKey
ALTER TABLE "social_account" ADD CONSTRAINT "social_account_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_share" ADD CONSTRAINT "activity_share_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_share_target" ADD CONSTRAINT "activity_share_target_activity_share_id_fkey" FOREIGN KEY ("activity_share_id") REFERENCES "activity_share"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_share_target" ADD CONSTRAINT "activity_share_target_social_account_id_fkey" FOREIGN KEY ("social_account_id") REFERENCES "social_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_share_log" ADD CONSTRAINT "activity_share_log_activity_share_id_fkey" FOREIGN KEY ("activity_share_id") REFERENCES "activity_share"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_share_log" ADD CONSTRAINT "activity_share_log_activity_share_target_id_fkey" FOREIGN KEY ("activity_share_target_id") REFERENCES "activity_share_target"("id") ON DELETE CASCADE ON UPDATE CASCADE;
