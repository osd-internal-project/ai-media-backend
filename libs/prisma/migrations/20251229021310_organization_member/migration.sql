-- AlterTable
ALTER TABLE "organization_member" ADD COLUMN     "api_keys" TEXT,
ADD COLUMN     "maxToken" INTEGER DEFAULT 0,
ADD COLUMN     "max_images" INTEGER DEFAULT 0;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "tier" SET DEFAULT 'free',
ALTER COLUMN "maxToken" DROP NOT NULL,
ALTER COLUMN "max_images" DROP NOT NULL;
