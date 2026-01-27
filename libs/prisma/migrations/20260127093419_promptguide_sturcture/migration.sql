-- AlterTable
ALTER TABLE "prompt_guide" ADD COLUMN     "generate_type" VARCHAR(10) NOT NULL DEFAULT 'image',
ADD COLUMN     "image_paths" JSONB[] DEFAULT ARRAY[]::JSONB[];

-- AlterTable
ALTER TABLE "prompt_guide_type" ADD COLUMN     "generate_type" VARCHAR(10) NOT NULL DEFAULT 'image';
