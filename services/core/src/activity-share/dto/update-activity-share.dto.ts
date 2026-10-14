import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
} from 'class-validator';
import {
  ACTIVITY_SHARE_STATUSES,
  ActivityShareStatus,
  MAX_MEDIA_PER_SHARE,
} from '@ai-media/share';
import { ShareMediaItemDto } from './create-activity-share.dto';

/** แก้ไขงานที่ยัง NEW หรือถูก REJECTED */
export class UpdateActivityShareDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
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
  @ArrayMaxSize(MAX_MEDIA_PER_SHARE)
  @Type(() => ShareMediaItemDto)
  mediaItems?: ShareMediaItemDto[];

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  socialAccountIds?: string[];
}

/** อนุมัติ/ปฏิเสธโดย OWNER หรือ ADMIN ของ org */
export class ReviewActivityShareDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  /** บังคับใส่เหตุผลตอน reject — เพื่อให้ member แก้ไขได้ตรงจุด */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reviewNote?: string;
}

/** ผู้กระทำสำหรับ action ที่ไม่มี body อื่น (send / retry / delete) */
export class ActorDto {
  @IsString()
  @IsNotEmpty()
  userId: string;
}

/** query ของ GET /activity-share */
export class ListActivityShareDto {
  @IsString()
  @IsNotEmpty()
  organizationId: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsIn(ACTIVITY_SHARE_STATUSES as unknown as string[])
  status?: ActivityShareStatus;

  /** กรองเฉพาะงานที่ยิงไป platform นี้ */
  @IsOptional()
  @IsString()
  platform?: string;

  /** ค้นจาก caption */
  @IsOptional()
  @IsString()
  search?: string;

  /** จำกัดเฉพาะงานของผู้ใช้คนนี้ (มุมมอง "งานของฉัน") */
  @IsOptional()
  @IsString()
  createdByUserId?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  pageSize?: string;
}
