import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CommunityVisibility } from '@prisma/client';
import { INTEGRATION_API_KEY_SCOPES, IntegrationApiKeyScope } from '@ai-media/share';

export class PublishToCommunityDto {
  @IsString()
  @IsNotEmpty()
  organizationId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  galleryIds: string[];

  @IsEnum(CommunityVisibility)
  visibility: CommunityVisibility;

  @IsBoolean()
  includePrompt: boolean;
}

/** feed งาน public สำหรับระบบภายนอก — ใหม่สุดก่อน แบ่งหน้าด้วย take/skip */
export class ListPublicPublicationsQueryDto {
  @IsOptional()
  @IsDateString()
  updatedSince?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  organizationId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;
}

export class CreateIntegrationApiKeyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsIn(INTEGRATION_API_KEY_SCOPES as unknown as string[], { each: true })
  scopes: IntegrationApiKeyScope[];
}
