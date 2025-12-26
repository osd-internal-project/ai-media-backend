import { PartialType } from '@nestjs/mapped-types';
import { CreateOrganizationMemberDto } from './create-organization-members.dto';

export class UpdateOrganizationMemberDto extends PartialType(
  CreateOrganizationMemberDto,
) {}
