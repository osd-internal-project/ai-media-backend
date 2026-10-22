import { IsObject, IsString, MaxLength, MinLength } from 'class-validator';
import { PHOTO_EVENT_PRINT_TEMPLATE_NAME_MAX_LENGTH } from '../photo-event.constants';

/** สร้าง/แก้ template การพิมพ์ — layout ถูกตรวจละเอียดด้วย parsePrintLayout ใน service */
export class SavePrintTemplateDto {
  @IsString()
  userId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(PHOTO_EVENT_PRINT_TEMPLATE_NAME_MAX_LENGTH)
  name: string;

  @IsObject()
  layout: Record<string, unknown>;
}
