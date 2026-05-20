-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "access_codes" TEXT[] DEFAULT ARRAY['image', 'video', 'omni', 'dream']::TEXT[];
