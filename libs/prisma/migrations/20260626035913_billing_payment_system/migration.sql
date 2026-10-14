-- CreateTable
CREATE TABLE "billing_profile" (
    "id" UUID NOT NULL,
    "user_id" VARCHAR(50) NOT NULL,
    "organization_id" VARCHAR(50) NOT NULL,
    "type" VARCHAR(20) NOT NULL,
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
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer" (
    "id" UUID NOT NULL,
    "customer_code" VARCHAR(20) NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "organization_id" VARCHAR(50) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "tax_id" VARCHAR(20),
    "branch_code" VARCHAR(20),
    "branch_name" VARCHAR(200),
    "address" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice" (
    "id" UUID NOT NULL,
    "invoice_no" VARCHAR(30) NOT NULL,
    "organization_id" VARCHAR(50) NOT NULL,
    "user_id" VARCHAR(50) NOT NULL,
    "billing_profile_id" UUID NOT NULL,
    "customer_id" UUID,
    "plan_id" VARCHAR(50),
    "plan_price_id" VARCHAR(50),
    "plan_name" VARCHAR(100) NOT NULL,
    "plan_interval" VARCHAR(20) NOT NULL,
    "sub_total" DECIMAL(10,2) NOT NULL,
    "vat_amount" DECIMAL(10,2) NOT NULL,
    "total_amount" DECIMAL(10,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'THB',
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "payment_method" VARCHAR(20) NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_at" TIMESTAMP(3),
    "expired_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt" (
    "id" UUID NOT NULL,
    "receipt_no" VARCHAR(30) NOT NULL,
    "invoice_id" UUID NOT NULL,
    "customer_id" UUID,
    "pre_vat_amount" DECIMAL(10,2) NOT NULL,
    "vat_amount" DECIMAL(10,2) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "method" VARCHAR(20) NOT NULL,
    "omise_charge_id" VARCHAR(100),
    "omise_source_id" VARCHAR(100),
    "authorize_uri" TEXT,
    "qr_image_uri" TEXT,
    "bank" VARCHAR(20),
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "raw_payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wht_request" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "receipt_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "organization_id" VARCHAR(50) NOT NULL,
    "user_id" VARCHAR(50) NOT NULL,
    "receipt_no" VARCHAR(30) NOT NULL,
    "receipt_date" TIMESTAMP(3) NOT NULL,
    "pre_vat_amount" DECIMAL(10,2) NOT NULL,
    "wht_percent" INTEGER NOT NULL,
    "wht_amount" DECIMAL(10,2) NOT NULL,
    "doc_ref_no" VARCHAR(100) NOT NULL,
    "doc_ref_date" TIMESTAMP(3) NOT NULL,
    "bank_account_name" VARCHAR(200) NOT NULL,
    "bank_name" VARCHAR(100) NOT NULL,
    "bank_account_number" VARCHAR(50) NOT NULL,
    "bank_branch_code" VARCHAR(50) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wht_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wht_request_status_log" (
    "id" UUID NOT NULL,
    "wht_request_id" UUID NOT NULL,
    "from_status" VARCHAR(20),
    "to_status" VARCHAR(20) NOT NULL,
    "admin_user_id" VARCHAR(50) NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wht_request_status_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_counter" (
    "id" UUID NOT NULL,
    "doc_type" VARCHAR(20) NOT NULL,
    "period" VARCHAR(10) NOT NULL,
    "last_value" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_counter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "billing_profile_user_id_idx" ON "billing_profile"("user_id");

-- CreateIndex
CREATE INDEX "billing_profile_organization_id_idx" ON "billing_profile"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_customer_code_key" ON "customer"("customer_code");

-- CreateIndex
CREATE UNIQUE INDEX "customer_tax_id_branch_code_key" ON "customer"("tax_id", "branch_code");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_invoice_no_key" ON "invoice"("invoice_no");

-- CreateIndex
CREATE INDEX "invoice_organization_id_idx" ON "invoice"("organization_id");

-- CreateIndex
CREATE INDEX "invoice_status_idx" ON "invoice"("status");

-- CreateIndex
CREATE UNIQUE INDEX "receipt_receipt_no_key" ON "receipt"("receipt_no");

-- CreateIndex
CREATE UNIQUE INDEX "receipt_invoice_id_key" ON "receipt"("invoice_id");

-- CreateIndex
CREATE INDEX "payment_invoice_id_idx" ON "payment"("invoice_id");

-- CreateIndex
CREATE INDEX "payment_omise_charge_id_idx" ON "payment"("omise_charge_id");

-- CreateIndex
CREATE INDEX "wht_request_organization_id_idx" ON "wht_request"("organization_id");

-- CreateIndex
CREATE INDEX "wht_request_status_idx" ON "wht_request"("status");

-- CreateIndex
CREATE INDEX "wht_request_status_log_wht_request_id_idx" ON "wht_request_status_log"("wht_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "document_counter_doc_type_period_key" ON "document_counter"("doc_type", "period");

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt" ADD CONSTRAINT "receipt_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wht_request" ADD CONSTRAINT "wht_request_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wht_request_status_log" ADD CONSTRAINT "wht_request_status_log_wht_request_id_fkey" FOREIGN KEY ("wht_request_id") REFERENCES "wht_request"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
