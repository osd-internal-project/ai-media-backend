import {
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { SOCIAL_PLATFORMS, SocialPlatform } from '@ai-media/share';

/**
 * body ของ POST /social-account/manual
 *
 * ใช้ตอนแอดมินระบบวาง token ให้ org เอง (เส้นทาง MANUAL) — จำเป็นระหว่างที่
 * app review ของ provider ยังไม่ผ่าน จึงยังใช้ OAuth flow ไม่ได้
 */
export class SaveManualTokenDto {
  @IsString()
  @IsNotEmpty()
  organizationId: string;

  /** ผู้กระทำ — ต้องเป็น SUPER_ADMIN (ตรวจใน service) */
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsIn(SOCIAL_PLATFORMS as unknown as string[])
  platform: SocialPlatform;

  /** FB Page id / IG user id / TikTok open_id / YouTube channel id */
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  externalId: string;

  /**
   * ว่างได้เฉพาะตอนแก้บัญชีที่มีอยู่แล้ว = คงค่าเดิมไว้
   * (ฟอร์มเป็น write-only จึงไม่มีทางเติมค่าเดิมกลับมาให้ผู้ใช้เห็น)
   */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  accessToken?: string;

  /** จำเป็นสำหรับ TikTok/YouTube ที่ access token หมดอายุเร็ว */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  refreshToken?: string;

  @IsOptional()
  @IsISO8601()
  tokenExpiresAt?: string;

  /** ว่าง = ใช้ชื่อที่ดึงมาจาก provider */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  displayName?: string;
}
