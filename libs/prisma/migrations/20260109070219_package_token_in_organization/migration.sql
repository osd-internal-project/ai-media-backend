-- AlterTable
ALTER TABLE "organization" ADD COLUMN     "max_user_access" INTEGER,
ADD COLUMN     "package_image_amount" INTEGER,
ADD COLUMN     "package_token_amount" INTEGER;

-- AlterTable
ALTER TABLE "organization_member" ADD COLUMN     "available_image_amount" INTEGER DEFAULT 0,
ADD COLUMN     "available_token_amount" INTEGER DEFAULT 0,
ADD COLUMN     "remain_image_amount" INTEGER DEFAULT 0,
ADD COLUMN     "remain_token_amount" INTEGER DEFAULT 0,
ALTER COLUMN "maxToken" DROP DEFAULT;
