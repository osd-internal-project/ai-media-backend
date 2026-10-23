import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export const ANNOUNCEMENT_CATEGORIES = ['PROMOTION', 'SYSTEM_UPDATE'] as const;
export type AnnouncementCategory = (typeof ANNOUNCEMENT_CATEGORIES)[number];

// multipart ส่งทุก field เป็น string — แปลง 'true'/'false' เอง
const toBoolean = ({ value }: { value: unknown }) =>
  value === true || value === 'true';

/** field ของ multipart form ที่ส่งมาพร้อมรูป (รูปไม่บังคับ) */
export class SaveAnnouncementDto {
  @IsIn(ANNOUNCEMENT_CATEGORIES)
  category: AnnouncementCategory;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  body?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isActive?: boolean;

  /** true = ลบรูปเดิมออก (ใช้ตอนแก้ไขเท่านั้น) */
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  removeImage?: boolean;
}

/** สลับ active จากตาราง admin โดยไม่ต้องส่งทั้งฟอร์ม */
export class SetAnnouncementActiveDto {
  @IsBoolean()
  isActive: boolean;
}
