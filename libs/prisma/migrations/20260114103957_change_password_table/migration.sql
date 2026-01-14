-- CreateTable
CREATE TABLE "request_change_password" (
    "id" TEXT NOT NULL,
    "username" VARCHAR(200) NOT NULL,
    "email" VARCHAR(200) NOT NULL,
    "token" VARCHAR(100) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "request_change_password_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "request_change_password_token_key" ON "request_change_password"("token");

-- CreateIndex
CREATE INDEX "request_change_password_id_idx" ON "request_change_password"("id");
