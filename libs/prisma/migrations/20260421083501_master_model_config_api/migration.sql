-- AlterTable
ALTER TABLE "master_model_type" ADD COLUMN     "option_code" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "send_api" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "send_config" JSONB;

-- CreateTable
CREATE TABLE "master_model_option" (
    "id" VARCHAR(50) NOT NULL,
    "option_code" VARCHAR(20) NOT NULL,
    "avaliable" VARCHAR(20) NOT NULL,
    "description" VARCHAR(20)
);

-- CreateIndex
CREATE UNIQUE INDEX "master_model_option_id_key" ON "master_model_option"("id");

-- CreateIndex
CREATE UNIQUE INDEX "master_model_option_option_code_key" ON "master_model_option"("option_code");

-- CreateIndex
CREATE UNIQUE INDEX "master_model_option_avaliable_key" ON "master_model_option"("avaliable");

-- CreateIndex
CREATE UNIQUE INDEX "master_model_option_description_key" ON "master_model_option"("description");
