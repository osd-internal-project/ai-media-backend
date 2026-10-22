-- CreateTable
CREATE TABLE "photo_event_print_template" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "layout" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "photo_event_print_template_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "photo_event_print_template_project_id_idx" ON "photo_event_print_template"("project_id");

-- AddForeignKey
ALTER TABLE "photo_event_print_template" ADD CONSTRAINT "photo_event_print_template_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
