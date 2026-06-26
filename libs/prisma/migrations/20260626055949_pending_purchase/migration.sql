-- CreateTable
CREATE TABLE "pending_purchase" (
    "id" UUID NOT NULL,
    "user_id" VARCHAR(50) NOT NULL,
    "plan_id" VARCHAR(50) NOT NULL,
    "plan_price_id" VARCHAR(50) NOT NULL,
    "plan_name" VARCHAR(100) NOT NULL,
    "plan_interval" VARCHAR(20) NOT NULL,
    "org_name" VARCHAR(150) NOT NULL,
    "org_description" TEXT,
    "org_type" VARCHAR(50) NOT NULL DEFAULT 'team',
    "billing_type" VARCHAR(20) NOT NULL,
    "full_name" VARCHAR(200),
    "national_id" VARCHAR(20),
    "company_name" VARCHAR(200),
    "tax_id" VARCHAR(20),
    "branch_code" VARCHAR(20),
    "branch_name" VARCHAR(200),
    "contact_name" VARCHAR(200),
    "phone" VARCHAR(50),
    "email" VARCHAR(200),
    "address" TEXT NOT NULL,
    "sub_total" DECIMAL(10,2) NOT NULL,
    "vat_amount" DECIMAL(10,2) NOT NULL,
    "total_amount" DECIMAL(10,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'THB',
    "payment_method" VARCHAR(20) NOT NULL,
    "omise_charge_id" VARCHAR(100),
    "omise_source_id" VARCHAR(100),
    "authorize_uri" TEXT,
    "qr_image_uri" TEXT,
    "bank" VARCHAR(20),
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "created_organization_id" VARCHAR(50),
    "invoice_id" UUID,
    "expired_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pending_purchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pending_purchase_user_id_idx" ON "pending_purchase"("user_id");

-- CreateIndex
CREATE INDEX "pending_purchase_status_idx" ON "pending_purchase"("status");

-- CreateIndex
CREATE INDEX "pending_purchase_omise_charge_id_idx" ON "pending_purchase"("omise_charge_id");
