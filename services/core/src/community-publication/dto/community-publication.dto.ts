import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
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

export const COMMUNITY_WEBHOOK_EVENTS = ['APPROVED', 'REJECTED', 'REMOVED'] as const;
export type CommunityWebhookEvent = (typeof COMMUNITY_WEBHOOK_EVENTS)[number];

/** Community แจ้งผลการตรวจ / การถอดงาน — สัญญาอยู่ใน docs/community-api-contract.md */
export class CommunityWebhookDto {
  @IsString()
  @IsNotEmpty()
  aicavePublicationId: string;

  @IsIn(COMMUNITY_WEBHOOK_EVENTS as unknown as string[])
  event: CommunityWebhookEvent;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  communityItemId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
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
