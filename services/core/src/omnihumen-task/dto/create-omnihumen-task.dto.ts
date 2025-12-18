export class CreateOmnihumenTaskDto {
  uuid?: string;
  status: boolean;
  taskId: string;
  taskRequestId?: string;
  taskMessage?: string;
  fileId?: string;
  filePath?: string;
  projectId: string;
  userId?: string;
  avatarName?: string;
  prompt?: string;
}
