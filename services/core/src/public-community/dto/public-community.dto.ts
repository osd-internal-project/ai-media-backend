import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { COMMUNITY_FEED_SORTS } from '@ai-media/share';

/**
 * query ของ feed สาธารณะ
 *
 * จงใจไม่มี field `status`, `organizationId` หรือ `projectId` — ผู้เยี่ยมชม
 * ต้องไม่มีทางเลือกดูอย่างอื่นนอกจากโพสต์ที่เผยแพร่แล้ว
 */
export class PublicFeedQueryDto {
  @IsOptional()
  @IsIn(COMMUNITY_FEED_SORTS as unknown as string[])
  sort?: string;

  /** กรองตาม hashtag 1 ตัว */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  tag?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  pageSize?: string;
}

/** ตัวระบุผู้เยี่ยมชมแบบไม่ระบุตัวตน สำหรับกดไลก์ */
export class VisitorDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  visitorId: string;
}
