import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class ProjectMemberLimitDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  limitCreditAllowance?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  limitImageAllowance?: number;
}

/** PATCH /project/:id — used/hold counters are owned by the generation flow and never accepted here */
export class UpdateProjectDto {
  /** caller (userId or Keycloak sub) — used when AUTH_MODE gives no token user */
  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  limitCreditAllowance?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  limitImageAllowance?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProjectMemberLimitDto)
  members?: ProjectMemberLimitDto[];
}
