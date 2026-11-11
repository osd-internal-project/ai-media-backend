-- All-or-nothing: a duplicate email must not leave the column half-migrated (P3009).
BEGIN;

-- Fail fast instead of queueing live logins behind a stuck transaction.
SET LOCAL lock_timeout = '3s';

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- DropIndex
DROP INDEX "users_email_idx";

-- AlterTable: compare emails case-insensitively; stored value keeps the user's casing.
ALTER TABLE "users" ALTER COLUMN "email" SET DATA TYPE CITEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

COMMIT;
