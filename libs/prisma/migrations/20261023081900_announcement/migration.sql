-- CreateTable
CREATE TABLE "announcement" (
    "id" TEXT NOT NULL,
    "category" VARCHAR(30) NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "body" TEXT,
    "image_key" VARCHAR(255),
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "announcement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "announcement_is_active_sort_order_idx" ON "announcement"("is_active", "sort_order");

