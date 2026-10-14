-- CreateTable
CREATE TABLE "photo_event_template" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "prompt_guide_id" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "photo_event_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "photo_event_photo" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "organization_id" VARCHAR(50) NOT NULL,
    "user_id" TEXT NOT NULL,
    "image_path" TEXT NOT NULL,
    "image_name" TEXT NOT NULL,
    "image_type" VARCHAR(50) NOT NULL,
    "image_size" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "photo_event_photo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "photo_event_generation" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "photo_id" TEXT NOT NULL,
    "prompt_guide_id" INTEGER NOT NULL,
    "user_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "progress" INTEGER,
    "output_key" TEXT,
    "gallery_id" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "photo_event_generation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "photo_event_template_project_id_prompt_guide_id_key" ON "photo_event_template"("project_id", "prompt_guide_id");

-- CreateIndex
CREATE INDEX "photo_event_photo_project_id_status_idx" ON "photo_event_photo"("project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "photo_event_generation_task_id_key" ON "photo_event_generation"("task_id");

-- CreateIndex
CREATE INDEX "photo_event_generation_project_id_idx" ON "photo_event_generation"("project_id");

-- CreateIndex
CREATE INDEX "photo_event_generation_photo_id_idx" ON "photo_event_generation"("photo_id");

-- AddForeignKey
ALTER TABLE "photo_event_template" ADD CONSTRAINT "photo_event_template_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photo_event_template" ADD CONSTRAINT "photo_event_template_prompt_guide_id_fkey" FOREIGN KEY ("prompt_guide_id") REFERENCES "prompt_guide"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photo_event_photo" ADD CONSTRAINT "photo_event_photo_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photo_event_generation" ADD CONSTRAINT "photo_event_generation_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "photo_event_photo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

