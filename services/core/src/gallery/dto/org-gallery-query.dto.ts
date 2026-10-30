import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { CommunityPublicationStatus } from '@prisma/client';
import { GENERATION_TYPE_KEYS, GenerationTypeKey } from '@ai-media/share';

/** 'NONE' = งานที่ยังไม่เคยส่งไป Community */
export const PUBLISH_STATUS_FILTERS = [
  'NONE',
  ...Object.values(CommunityPublicationStatus),
] as const;
export type PublishStatusFilter = (typeof PUBLISH_STATUS_FILTERS)[number];

export class OrgGalleryQueryDto {
  @IsOptional()
  @IsIn(GENERATION_TYPE_KEYS)
  type?: GenerationTypeKey;

  @IsOptional()
  @IsIn(PUBLISH_STATUS_FILTERS)
  publishStatus?: PublishStatusFilter;

  @IsOptional()
  @IsString()
  memberId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
