-- AlterTable
ALTER TABLE "organization" ADD COLUMN     "closed_message" TEXT,
ADD COLUMN     "is_open" BOOLEAN NOT NULL DEFAULT true;
