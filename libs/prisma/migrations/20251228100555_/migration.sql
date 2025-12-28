-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "userId" VARCHAR(50) NOT NULL,
    "username" VARCHAR(100) NOT NULL,
    "fullname" VARCHAR(200) NOT NULL,
    "email" VARCHAR(200) NOT NULL,
    "tier" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "phoneNumber" VARCHAR(50) NOT NULL DEFAULT 'phone_number',
    "status" VARCHAR(50) NOT NULL DEFAULT 'active',
    "last_on" TIMESTAMP(3),
    "maxToken" INTEGER NOT NULL DEFAULT 0,
    "max_images" INTEGER NOT NULL DEFAULT 0,
    "api_keys" TEXT,
    "token" VARCHAR(50),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "recent_organization_id" VARCHAR(50),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" VARCHAR(10) DEFAULT 'active',
    "organization_id" VARCHAR(50),

    CONSTRAINT "project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_member" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gallery" (
    "id" TEXT NOT NULL,
    "taskId" TEXT,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "prompt" TEXT,
    "thumbnailUrl" TEXT,
    "typeGenerate" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" BOOLEAN DEFAULT false,

    CONSTRAINT "gallery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "log" (
    "id" TEXT NOT NULL,
    "taskId" TEXT,
    "status" TEXT,
    "typeGenerate" TEXT,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "tokenUsed" INTEGER NOT NULL,
    "ImageUsed" INTEGER NOT NULL,
    "referenceImages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "resolution" TEXT,
    "ratio" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "groups" (
    "id" SERIAL NOT NULL,
    "group_id" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "display_name" VARCHAR(100),
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role" (
    "id" SERIAL NOT NULL,
    "role_id" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "type" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_role" (
    "id" SERIAL NOT NULL,
    "groupId" VARCHAR(50) NOT NULL,
    "roleId" VARCHAR(50) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_group" (
    "id" SERIAL NOT NULL,
    "userId" VARCHAR(50) NOT NULL,
    "groupId" VARCHAR(50) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_model_type" (
    "id" SERIAL NOT NULL,
    "model_type" VARCHAR(150),
    "type" VARCHAR(150),
    "description" VARCHAR(150),
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "model_details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "generate_image" (
    "id" SERIAL NOT NULL,
    "file_name" VARCHAR(150),
    "file_path" VARCHAR(150),
    "file_type" VARCHAR(150),
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "history_logs_images" (
    "id" SERIAL NOT NULL,
    "user_id" VARCHAR(50),
    "token" VARCHAR(50),
    "model_type" VARCHAR(150),
    "image_id" VARCHAR(150),
    "status" VARCHAR(50),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "master_data_config_api" (
    "id" SERIAL NOT NULL,
    "config_type" VARCHAR(150),
    "authorization" VARCHAR(150),
    "api_create_image" VARCHAR(250),
    "api_update_task_vdo" VARCHAR(250),
    "max_image" INTEGER,
    "watermark" BOOLEAN,
    "stream" BOOLEAN,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "prompt_guide" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(150),
    "text_prompt" TEXT,
    "status" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "prompt_guide_type_id" INTEGER,
    "organization_id" VARCHAR(50)
);

-- CreateTable
CREATE TABLE "prompt_guide_type" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(150),
    "status" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organization_id" VARCHAR(50)
);

-- CreateTable
CREATE TABLE "omnihumen_task" (
    "id" SERIAL NOT NULL,
    "uuid" VARCHAR(50),
    "status" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "task_id" VARCHAR(100) NOT NULL,
    "task_request_id" VARCHAR(100),
    "task_message" VARCHAR(20),
    "file_id" VARCHAR(100),
    "file_path" TEXT,
    "file_org_path" TEXT,
    "project_id" VARCHAR(100) NOT NULL,
    "user_id" VARCHAR(100),
    "avatar_name" VARCHAR(150),
    "prompt" TEXT,
    "task_code" VARCHAR(20)
);

-- CreateTable
CREATE TABLE "organization" (
    "id" SERIAL NOT NULL,
    "organization_id" VARCHAR(50) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "slug" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "type" VARCHAR(50) NOT NULL,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" VARCHAR(50) NOT NULL,
    "updated_by" VARCHAR(50)
);

-- CreateTable
CREATE TABLE "organization_member" (
    "id" SERIAL NOT NULL,
    "user_id" VARCHAR(50) NOT NULL,
    "organization_id" VARCHAR(50) NOT NULL,
    "role" VARCHAR(50) NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "users_userId_key" ON "users"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "project_member_projectId_userId_key" ON "project_member"("projectId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "groups_group_id_key" ON "groups"("group_id");

-- CreateIndex
CREATE UNIQUE INDEX "role_role_id_key" ON "role"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "group_role_groupId_roleId_key" ON "group_role"("groupId", "roleId");

-- CreateIndex
CREATE UNIQUE INDEX "user_group_userId_groupId_key" ON "user_group"("userId", "groupId");

-- CreateIndex
CREATE UNIQUE INDEX "master_model_type_id_key" ON "master_model_type"("id");

-- CreateIndex
CREATE UNIQUE INDEX "generate_image_id_key" ON "generate_image"("id");

-- CreateIndex
CREATE UNIQUE INDEX "history_logs_images_id_key" ON "history_logs_images"("id");

-- CreateIndex
CREATE UNIQUE INDEX "master_data_config_api_id_key" ON "master_data_config_api"("id");

-- CreateIndex
CREATE UNIQUE INDEX "prompt_guide_id_key" ON "prompt_guide"("id");

-- CreateIndex
CREATE UNIQUE INDEX "prompt_guide_type_id_key" ON "prompt_guide_type"("id");

-- CreateIndex
CREATE UNIQUE INDEX "omnihumen_task_id_key" ON "omnihumen_task"("id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_id_key" ON "organization"("id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_organization_id_key" ON "organization"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_member_id_key" ON "organization_member"("id");

-- AddForeignKey
ALTER TABLE "project_member" ADD CONSTRAINT "project_member_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_member" ADD CONSTRAINT "project_member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gallery" ADD CONSTRAINT "gallery_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gallery" ADD CONSTRAINT "gallery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "log" ADD CONSTRAINT "log_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "log" ADD CONSTRAINT "log_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_role" ADD CONSTRAINT "group_role_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("group_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_role" ADD CONSTRAINT "group_role_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role"("role_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_group" ADD CONSTRAINT "user_group_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_group" ADD CONSTRAINT "user_group_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("group_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prompt_guide" ADD CONSTRAINT "prompt_guide_prompt_guide_type_id_fkey" FOREIGN KEY ("prompt_guide_type_id") REFERENCES "prompt_guide_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_member" ADD CONSTRAINT "organization_member_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
