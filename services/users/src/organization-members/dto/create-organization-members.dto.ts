import { IsNotEmpty, IsString } from 'class-validator';

export class CreateOrganizationMemberDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  organizationId: string;

  role?: string;
  maxToken?: number;
  maxImages?: number;
  apiKeys?: string;
}
