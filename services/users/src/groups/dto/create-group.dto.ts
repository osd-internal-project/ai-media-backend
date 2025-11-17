export class CreateGroupDto {
  id?: number;
  groupId?: string;
  name?: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
  users: string[];
  roles: string[];
}
