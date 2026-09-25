import { IsString } from 'class-validator';

/** field ของ multipart form ที่ส่งมาพร้อมไฟล์ */
export class UploadPhotosDto {
  @IsString()
  userId: string;
}
