-- RenameForeignKey
ALTER TABLE "gallery" RENAME CONSTRAINT "gallery_projectId_fkey" TO "gallery_project_id_fkey";

-- RenameForeignKey
ALTER TABLE "gallery" RENAME CONSTRAINT "gallery_userId_fkey" TO "gallery_user_id_fkey";

-- RenameForeignKey
ALTER TABLE "group_role" RENAME CONSTRAINT "group_role_groupId_fkey" TO "group_role_group_id_fkey";

-- RenameForeignKey
ALTER TABLE "group_role" RENAME CONSTRAINT "group_role_roleId_fkey" TO "group_role_role_id_fkey";

-- RenameForeignKey
ALTER TABLE "log" RENAME CONSTRAINT "log_projectId_fkey" TO "log_project_id_fkey";

-- RenameForeignKey
ALTER TABLE "log" RENAME CONSTRAINT "log_userId_fkey" TO "log_user_id_fkey";

-- RenameForeignKey
ALTER TABLE "project_member" RENAME CONSTRAINT "project_member_projectId_fkey" TO "project_member_project_id_fkey";

-- RenameForeignKey
ALTER TABLE "project_member" RENAME CONSTRAINT "project_member_userId_fkey" TO "project_member_user_id_fkey";

-- RenameForeignKey
ALTER TABLE "user_group" RENAME CONSTRAINT "user_group_groupId_fkey" TO "user_group_group_id_fkey";

-- RenameForeignKey
ALTER TABLE "user_group" RENAME CONSTRAINT "user_group_userId_fkey" TO "user_group_user_id_fkey";

-- RenameIndex
ALTER INDEX "group_role_groupId_roleId_key" RENAME TO "group_role_group_id_role_id_key";

-- RenameIndex
ALTER INDEX "project_member_projectId_userId_key" RENAME TO "project_member_project_id_user_id_key";

-- RenameIndex
ALTER INDEX "user_group_userId_groupId_key" RENAME TO "user_group_user_id_group_id_key";

-- RenameIndex
ALTER INDEX "users_userId_key" RENAME TO "users_user_id_key";
