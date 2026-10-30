-- CreateEnum
CREATE TYPE "CommunityPublicationStatus" AS ENUM ('PENDING', 'PUBLISHED', 'REJECTED', 'REMOVED', 'FAILED');

-- CreateEnum
CREATE TYPE "CommunityVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- AlterTable
ALTER TABLE "master_model_type" ADD COLUMN     "allow_publish" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "community_publication" (
    "id" TEXT NOT NULL,
    "gallery_id" TEXT,
    "organization_id" VARCHAR(50) NOT NULL,
    "user_id" VARCHAR(50) NOT NULL,
    "status" "CommunityPublicationStatus" NOT NULL DEFAULT 'PENDING',
    "visibility" "CommunityVisibility" NOT NULL DEFAULT 'PUBLIC',
    "include_prompt" BOOLEAN NOT NULL DEFAULT false,
    "preview_items" JSONB NOT NULL DEFAULT '[]',
    "community_item_id" TEXT,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "published_at" TIMESTAMP(3),

    CONSTRAINT "community_publication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "community_publication_gallery_id_key" ON "community_publication"("gallery_id");

-- CreateIndex
CREATE INDEX "community_publication_organization_id_status_idx" ON "community_publication"("organization_id", "status");

-- CreateIndex
CREATE INDEX "community_publication_user_id_idx" ON "community_publication"("user_id");

-- AddForeignKey
ALTER TABLE "community_publication" ADD CONSTRAINT "community_publication_gallery_id_fkey" FOREIGN KEY ("gallery_id") REFERENCES "gallery"("id") ON DELETE SET NULL ON UPDATE CASCADE;

