-- CreateTable
CREATE TABLE "community_post" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(180) NOT NULL,
    "organization_id" VARCHAR(50) NOT NULL,
    "project_id" TEXT NOT NULL,
    "created_by_user_id" VARCHAR(50) NOT NULL,
    "title" VARCHAR(200) NOT NULL DEFAULT '',
    "caption" TEXT NOT NULL DEFAULT '',
    "hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "link_url" VARCHAR(500),
    "media_items" JSONB NOT NULL DEFAULT '[]',
    "show_prompt" BOOLEAN NOT NULL DEFAULT false,
    "prompt_snapshot" TEXT,
    "author_display_name" VARCHAR(200) NOT NULL DEFAULT '',
    "organization_display_name" VARCHAR(200) NOT NULL DEFAULT '',
    "status" VARCHAR(20) NOT NULL DEFAULT 'NEW',
    "reviewed_by_user_id" VARCHAR(50),
    "reviewed_at" TIMESTAMPTZ(6),
    "review_note" TEXT,
    "scheduled_at" TIMESTAMPTZ(6),
    "published_at" TIMESTAMPTZ(6),
    "unpublished_at" TIMESTAMPTZ(6),
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "like_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "community_post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_post_log" (
    "id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "action" VARCHAR(30) NOT NULL,
    "from_status" VARCHAR(20),
    "to_status" VARCHAR(20) NOT NULL,
    "action_user_id" VARCHAR(50),
    "actor_type" VARCHAR(20) NOT NULL DEFAULT 'USER',
    "note" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_post_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_post_reaction" (
    "id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "visitor_hash" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_post_reaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "community_post_slug_key" ON "community_post"("slug");

-- CreateIndex
CREATE INDEX "community_post_status_published_at_idx" ON "community_post"("status", "published_at");

-- CreateIndex
CREATE INDEX "community_post_organization_id_status_idx" ON "community_post"("organization_id", "status");

-- CreateIndex
CREATE INDEX "community_post_project_id_idx" ON "community_post"("project_id");

-- CreateIndex
CREATE INDEX "community_post_created_by_user_id_idx" ON "community_post"("created_by_user_id");

-- CreateIndex
CREATE INDEX "community_post_status_scheduled_at_idx" ON "community_post"("status", "scheduled_at");

-- CreateIndex
CREATE INDEX "community_post_log_post_id_created_at_idx" ON "community_post_log"("post_id", "created_at");

-- CreateIndex
CREATE INDEX "community_post_log_action_idx" ON "community_post_log"("action");

-- CreateIndex
CREATE INDEX "community_post_reaction_post_id_idx" ON "community_post_reaction"("post_id");

-- CreateIndex
CREATE UNIQUE INDEX "community_post_reaction_post_id_visitor_hash_key" ON "community_post_reaction"("post_id", "visitor_hash");

-- AddForeignKey
ALTER TABLE "community_post" ADD CONSTRAINT "community_post_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_post_log" ADD CONSTRAINT "community_post_log_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "community_post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_post_reaction" ADD CONSTRAINT "community_post_reaction_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "community_post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
