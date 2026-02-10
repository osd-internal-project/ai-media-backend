-- CreateTable
CREATE TABLE "ref_images" (
    "id" SERIAL NOT NULL,
    "userId" VARCHAR(50) NOT NULL,
    "index" INTEGER NOT NULL DEFAULT 0,
    "projectId" VARCHAR(100) NOT NULL,
    "imageName" VARCHAR(200) NOT NULL,
    "imagePath" VARCHAR(200) NOT NULL,
    "imageType" VARCHAR(50) NOT NULL,
    "imageSize" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ref_images_pkey" PRIMARY KEY ("id")
);
