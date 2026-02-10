-- AlterTable
ALTER TABLE "gallery" ADD COLUMN     "generate_config" JSONB,
ALTER COLUMN "genneratedStatus" SET DEFAULT 'PENDING';
