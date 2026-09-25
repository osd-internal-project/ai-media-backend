import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PHOTO_EVENT_PROMPT_MAX_LENGTH } from '../photo-event.constants';

export class PhotoEventTemplateInputDto {
  @IsInt()
  promptGuideId: number;

  /** null หรือไม่ส่ง = ใช้ PHOTO_EVENT_DEFAULT_PROMPT_TAIL */
  @IsOptional()
  @IsString()
  @MaxLength(PHOTO_EVENT_PROMPT_MAX_LENGTH)
  promptTail?: string | null;
}

/** แทนที่รายการ template ของ project ทั้งชุด — ลำดับใน array คือลำดับที่แสดงบน kiosk */
export class SetTemplatesDto {
  @IsString()
  userId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PhotoEventTemplateInputDto)
  templates: PhotoEventTemplateInputDto[];
}
