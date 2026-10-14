import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { MAX_MEDIA_PER_SHARE } from '@ai-media/share';

/** สื่อ 1 ชิ้นที่ผู้ใช้เลือกจาก gallery */
export class ShareMediaItemDto {
  @IsString()
  @IsNotEmpty()
  galleryId: string;
}

export class CreateActivityShareDto {
  @IsString()
  @IsNotEmpty()
  organizationId: string;

  @IsString()
  @IsNotEmpty()
  projectId: string;

  /** ผู้สร้างงาน — ฝั่ง frontend ส่งมาตาม convention เดิมของโปรเจกต์ */
  @IsString()
  @IsNotEmpty()
  userId: string;

  /**
   * caption ไม่บังคับให้มี (บางโพสต์เป็นรูปล้วน) แต่จำกัดความยาวไว้ที่เพดานสูงสุด
   * ของทุก platform — ส่วนเพดานจริงรายแพลตฟอร์มตรวจใน service ตาม target ที่เลือก
   */
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

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_MEDIA_PER_SHARE)
  @Type(() => ShareMediaItemDto)
  mediaItems: ShareMediaItemDto[];

  /** บัญชี social ปลายทางที่จะโพสต์ */
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  socialAccountIds: string[];
}
