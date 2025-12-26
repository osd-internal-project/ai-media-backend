import { IsNotEmpty, IsString } from 'class-validator';

export class CreateOrganizationMemberDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  organizationId: string;

  @IsString()
  @IsNotEmpty()
  role: string;
}
