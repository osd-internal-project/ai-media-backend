import { PartialType } from '@nestjs/swagger';
import { CreateRolesOfGroupDto } from './create-roles-of-group.dto';

export class UpdateRolesOfGroupDto extends PartialType(CreateRolesOfGroupDto) {}
