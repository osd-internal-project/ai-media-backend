-- CreateTable
CREATE TABLE "app_setting" (
    "key" VARCHAR(100) NOT NULL,
    "value" JSONB NOT NULL,
    "updated_by" VARCHAR(100),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "app_setting_pkey" PRIMARY KEY ("key")
);
