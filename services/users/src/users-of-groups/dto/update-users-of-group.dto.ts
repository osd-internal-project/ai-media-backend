import { PartialType } from '@nestjs/swagger';
import { CreateUsersOfGroupDto } from './create-users-of-group.dto';

export class UpdateUsersOfGroupDto extends PartialType(CreateUsersOfGroupDto) {}
