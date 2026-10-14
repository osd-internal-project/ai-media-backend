import { IsIn, IsNotEmpty, IsString } from 'class-validator';
import { SOCIAL_PLATFORMS, SocialPlatform } from '@ai-media/share';

/** query ของ GET /social-account/connect/:platform */
export class ConnectSocialAccountDto {
  @IsString()
  @IsNotEmpty()
  organizationId: string;

  @IsString()
  @IsNotEmpty()
  userId: string;
}

/** param :platform ของทั้ง connect และ callback */
export class SocialPlatformParamDto {
  @IsIn(SOCIAL_PLATFORMS as unknown as string[])
  platform: SocialPlatform;
}

/** query ของ GET /social-account */
export class ListSocialAccountDto {
  @IsString()
  @IsNotEmpty()
  organizationId: string;
}
