-- CreateTable
CREATE TABLE "brand_kit" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "industry_type" VARCHAR(50),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "brand_ci_prompt" TEXT,
    "negative_prompt" TEXT,
    "organization_id" VARCHAR(50) NOT NULL,

    CONSTRAINT "brand_kit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand_kit_color" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "detail" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "brand_kit_id" UUID,

    CONSTRAINT "brand_kit_color_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "brand_kit" ADD CONSTRAINT "brand_kit_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_kit_color" ADD CONSTRAINT "brand_kit_color_brand_kit_id_fkey" FOREIGN KEY ("brand_kit_id") REFERENCES "brand_kit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
