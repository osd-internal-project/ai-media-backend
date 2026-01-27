-- CreateTable
CREATE TABLE "prompt_guide_images" (
    "id" SERIAL NOT NULL,
    "uid" VARCHAR(50) NOT NULL,
    "user_id" VARCHAR(50) NOT NULL,
    "index" INTEGER NOT NULL DEFAULT 0,
    "image_name" VARCHAR(200) NOT NULL,
    "image_path" VARCHAR(200) NOT NULL,
    "image_type" VARCHAR(50) NOT NULL,
    "image_size" INTEGER NOT NULL DEFAULT 0,
    "generate_type" VARCHAR(50) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'waiting',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prompt_guide_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "prompt_guide_images_uid_key" ON "prompt_guide_images"("uid");
