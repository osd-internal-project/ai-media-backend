import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import {
  COMMUNITY_FEED_SORTS,
  COMMUNITY_POST_STATUSES,
  CommunityPostStatus,
  MAX_COMMUNITY_CAPTION_LENGTH,
  MAX_COMMUNITY_TITLE_LENGTH,
  MAX_MEDIA_PER_COMMUNITY_POST,
} from '@ai-media/share';
import { CommunityMediaItemDto } from './create-community-post.dto';

/** แก้ไขโพสต์ที่ยัง NEW หรือถูก REJECTED */
export class UpdateCommunityPostDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_COMMUNITY_TITLE_LENGTH)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_COMMUNITY_CAPTION_LENGTH)
  caption?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(30)
  hashtags?: string[];

  @IsOptional()
  @IsUrl({ require_protocol: true })
  linkUrl?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_MEDIA_PER_COMMUNITY_POST)
  @Type(() => CommunityMediaItemDto)
  mediaItems?: CommunityMediaItemDto[];

  @IsOptional()
  @IsBoolean()
  showPrompt?: boolean;
}

/**
 * อนุมัติ/ปฏิเสธโดย OWNER หรือ ADMIN ของ org
 *
 * ใส่ scheduledAt มาพร้อมการอนุมัติได้ — แอดมินหลายคนอยากกด "อนุมัติและตั้งเวลา"
 * ในจังหวะเดียว ไม่ต้องกลับมาอีกรอบ
 */
export class ReviewCommunityPostDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  /** บังคับใส่เหตุผลตอน reject — เพื่อให้เจ้าของโพสต์แก้ไขได้ตรงจุด */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reviewNote?: string;

  /** ISO 8601 พร้อม offset — ใส่เฉพาะตอน approve ถ้าต้องการตั้งเวลาเผยแพร่ */
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}

/** ตั้งเวลาเผยแพร่ให้โพสต์ที่อนุมัติแล้ว */
export class ScheduleCommunityPostDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsDateString()
  scheduledAt: string;
}

/** ผู้กระทำสำหรับ action ที่ไม่มี body อื่น (publish / unschedule / republish) */
export class ActorDto {
  @IsString()
  @IsNotEmpty()
  userId: string;
}

/** ถอดโพสต์ออกจากหน้าสาธารณะ */
export class UnpublishCommunityPostDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  /** เหตุผลของการถอด — เก็บลง log เพื่อให้ตอบคำถามย้อนหลังได้ */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

/** query ของ GET /community-post (ฝั่ง studio) */
export class ListCommunityPostDto {
  @IsString()
  @IsNotEmpty()
  organizationId: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsIn(COMMUNITY_POST_STATUSES as unknown as string[])
  status?: CommunityPostStatus;

  /** ค้นจาก title และ caption */
  @IsOptional()
  @IsString()
  search?: string;

  /** จำกัดเฉพาะโพสต์ของผู้ใช้คนนี้ (มุมมอง "งานของฉัน") */
  @IsOptional()
  @IsString()
  createdByUserId?: string;

  /** latest = ใหม่สุดก่อน, popular = ยอดวิว/ไลก์สูงสุดก่อน (ใช้ในมุมมอง Insights) */
  @IsOptional()
  @IsIn(COMMUNITY_FEED_SORTS as unknown as string[])
  sort?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  pageSize?: string;
}
