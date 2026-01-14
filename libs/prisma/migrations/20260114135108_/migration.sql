-- CreateTable
CREATE TABLE "registers" (
    "id" SERIAL NOT NULL,
    "username" VARCHAR(100) NOT NULL,
    "password" VARCHAR(255) NOT NULL,
    "email" VARCHAR(200) NOT NULL,
    "fullname" VARCHAR(200) NOT NULL,
    "phone_number" VARCHAR(50),
    "token" VARCHAR(100) NOT NULL,
    "is_verify" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "registers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "registers_token_key" ON "registers"("token");
