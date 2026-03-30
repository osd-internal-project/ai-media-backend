-- CreateTable
CREATE TABLE "coupon_code" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "usage_limit" INTEGER NOT NULL DEFAULT 1,
    "fix_organization_id" VARCHAR(50),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "on_top_credit" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "coupon_code_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupon_code_usage" (
    "id" TEXT NOT NULL,
    "organization_id" VARCHAR(50),
    "used_at" TIMESTAMP(3) NOT NULL,
    "used_by_id" VARCHAR(50) NOT NULL,
    "on_top_credit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "organization_name" VARCHAR(200) NOT NULL,
    "organization_code" VARCHAR(200) NOT NULL,
    "used_by_name" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "coupon_code_id" VARCHAR(100) NOT NULL,

    CONSTRAINT "coupon_code_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "coupon_code_id_idx" ON "coupon_code"("id");

-- CreateIndex
CREATE UNIQUE INDEX "coupon_code_usage_coupon_code_id_key" ON "coupon_code_usage"("coupon_code_id");

-- CreateIndex
CREATE INDEX "coupon_code_usage_coupon_code_id_idx" ON "coupon_code_usage"("coupon_code_id");

-- AddForeignKey
ALTER TABLE "coupon_code_usage" ADD CONSTRAINT "coupon_code_usage_coupon_code_id_fkey" FOREIGN KEY ("coupon_code_id") REFERENCES "coupon_code"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
