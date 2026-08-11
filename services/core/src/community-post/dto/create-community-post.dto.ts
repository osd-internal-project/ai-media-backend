import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import {
  MAX_COMMUNITY_CAPTION_LENGTH,
  MAX_COMMUNITY_TITLE_LENGTH,
  MAX_MEDIA_PER_COMMUNITY_POST,
} from '@ai-media/share';

/** สื่อ 1 ชิ้นที่ผู้ใช้เลือกจาก gallery */
export class CommunityMediaItemDto {
  @IsString()
  @IsNotEmpty()
  galleryId: string;
}

export class CreateCommunityPostDto {
  @IsString()
  @IsNotEmpty()
  organizationId: string;

  @IsString()
  @IsNotEmpty()
  projectId: string;

  /** ผู้สร้างโพสต์ — ฝั่ง frontend ส่งมาตาม convention เดิมของโปรเจกต์ */
  @IsString()
  @IsNotEmpty()
  userId: string;

  /** ใช้เป็นทั้งหัวข้อบนหน้า public และตัวตั้งต้นของ slug */
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_COMMUNITY_TITLE_LENGTH)
  title: string;

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

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_MEDIA_PER_COMMUNITY_POST)
  @Type(() => CommunityMediaItemDto)
  mediaItems: CommunityMediaItemDto[];

  /**
   * เปิดเผย prompt บนหน้า public หรือไม่
   *
   * default false โดยตั้งใจ — prompt มักเป็นทรัพย์สินทางปัญญาของผู้ใช้
   * การเปิดเผยต้องเป็นการเลือกเอง ไม่ใช่ผลข้างเคียงของการโพสต์
   */
  @IsOptional()
  @IsBoolean()
  showPrompt?: boolean;
}
