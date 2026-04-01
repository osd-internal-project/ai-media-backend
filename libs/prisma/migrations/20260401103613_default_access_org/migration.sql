-- AlterTable
ALTER TABLE "organization" ALTER COLUMN "access_codes" SET DEFAULT ARRAY['image', 'video', 'omni', 'dream']::TEXT[],
ALTER COLUMN "access_codes" SET DATA TYPE TEXT[];
