-- AlterTable
ALTER TABLE "gallery" ALTER COLUMN "imageUrl" DROP NOT NULL,
ALTER COLUMN "genneratedStatus" SET DATA TYPE VARCHAR(50);

-- AlterTable
ALTER TABLE "log" ADD COLUMN     "gallary_id" VARCHAR(100),
ADD COLUMN     "generateAudio" BOOLEAN DEFAULT false,
ADD COLUMN     "generate_config" JSONB;
