-- CreateIndex
CREATE INDEX "chat_message_conversation_id_sequence_idx" ON "chat_message"("conversation_id", "sequence");

-- CreateIndex
CREATE INDEX "gallery_project_id_type_generate_seq_idx" ON "gallery"("project_id", "type_generate", "seq");

-- CreateIndex
CREATE INDEX "gallery_task_id_idx" ON "gallery"("task_id");

-- CreateIndex
CREATE INDEX "gallery_user_id_idx" ON "gallery"("user_id");

-- CreateIndex
CREATE INDEX "log_task_id_idx" ON "log"("task_id");

-- CreateIndex
CREATE INDEX "log_project_id_status_created_at_idx" ON "log"("project_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "log_user_id_created_at_idx" ON "log"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "organization_member_organization_id_user_id_idx" ON "organization_member"("organization_id", "user_id");

-- CreateIndex
CREATE INDEX "package_transactions_organization_id_idx" ON "package_transactions"("organization_id");

-- CreateIndex
CREATE INDEX "project_organization_id_idx" ON "project"("organization_id");

-- CreateIndex
CREATE INDEX "project_member_user_id_idx" ON "project_member"("user_id");

-- CreateIndex
CREATE INDEX "users_token_idx" ON "users"("token");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");
