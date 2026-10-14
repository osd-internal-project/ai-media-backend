-- Rename camelCase columns to snake_case (data-preserving, metadata-only RENAME).
-- Postgres automatically updates dependent FK constraints, indexes and unique constraints.

-- users
ALTER TABLE "users" RENAME COLUMN "userId" TO "user_id";
ALTER TABLE "users" RENAME COLUMN "phoneNumber" TO "phone_number";
ALTER TABLE "users" RENAME COLUMN "maxToken" TO "max_token";

-- project
ALTER TABLE "project" RENAME COLUMN "createdAt" TO "created_at";

-- project_member
ALTER TABLE "project_member" RENAME COLUMN "projectId" TO "project_id";
ALTER TABLE "project_member" RENAME COLUMN "userId" TO "user_id";
ALTER TABLE "project_member" RENAME COLUMN "joinedAt" TO "joined_at";

-- gallery
ALTER TABLE "gallery" RENAME COLUMN "taskId" TO "task_id";
ALTER TABLE "gallery" RENAME COLUMN "projectId" TO "project_id";
ALTER TABLE "gallery" RENAME COLUMN "userId" TO "user_id";
ALTER TABLE "gallery" RENAME COLUMN "imageUrl" TO "image_url";
ALTER TABLE "gallery" RENAME COLUMN "thumbnailUrl" TO "thumbnail_url";
ALTER TABLE "gallery" RENAME COLUMN "typeGenerate" TO "type_generate";
ALTER TABLE "gallery" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "gallery" RENAME COLUMN "genneratedStatus" TO "gennerated_status";
ALTER TABLE "gallery" RENAME COLUMN "referenceImages" TO "reference_images";
ALTER TABLE "gallery" RENAME COLUMN "resultUrl" TO "result_url";
ALTER TABLE "gallery" RENAME COLUMN "generateAudio" TO "generate_audio";
ALTER TABLE "gallery" RENAME COLUMN "tokenUsed" TO "token_used";
ALTER TABLE "gallery" RENAME COLUMN "ImageUsed" TO "image_used";

-- log
ALTER TABLE "log" RENAME COLUMN "taskId" TO "task_id";
ALTER TABLE "log" RENAME COLUMN "typeGenerate" TO "type_generate";
ALTER TABLE "log" RENAME COLUMN "projectId" TO "project_id";
ALTER TABLE "log" RENAME COLUMN "userId" TO "user_id";
ALTER TABLE "log" RENAME COLUMN "tokenUsed" TO "token_used";
ALTER TABLE "log" RENAME COLUMN "ImageUsed" TO "image_used";
ALTER TABLE "log" RENAME COLUMN "referenceImages" TO "reference_images";
ALTER TABLE "log" RENAME COLUMN "generateAudio" TO "generate_audio";
ALTER TABLE "log" RENAME COLUMN "createdAt" TO "created_at";

-- group_role
ALTER TABLE "group_role" RENAME COLUMN "groupId" TO "group_id";
ALTER TABLE "group_role" RENAME COLUMN "roleId" TO "role_id";
ALTER TABLE "group_role" RENAME COLUMN "createdAt" TO "created_at";

-- user_group
ALTER TABLE "user_group" RENAME COLUMN "userId" TO "user_id";
ALTER TABLE "user_group" RENAME COLUMN "groupId" TO "group_id";
ALTER TABLE "user_group" RENAME COLUMN "createdAt" TO "created_at";

-- organization_member
ALTER TABLE "organization_member" RENAME COLUMN "maxToken" TO "max_token";

-- coupon_code
ALTER TABLE "coupon_code" RENAME COLUMN "referenceTag" TO "reference_tag";

-- plan_prices
ALTER TABLE "plan_prices" RENAME COLUMN "periodUnit" TO "period_unit";

-- package_transactions
ALTER TABLE "package_transactions" RENAME COLUMN "amountPaid" TO "amount_paid";
