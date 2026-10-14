import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule, SocialTokenModule } from '@ai-media/share';
import { SocialAccountController } from './social-account.controller';
import { SocialAccountService } from './social-account.service';
import { MetaOAuthProvider } from './oauth/meta-oauth.provider';
import { TikTokOAuthProvider } from './oauth/tiktok-oauth.provider';
import { YouTubeOAuthProvider } from './oauth/youtube-oauth.provider';

@Module({
  // JwtModule ไม่ตั้ง secret ตรงนี้ — sign/verify ส่ง secret เข้าไปรายครั้ง
  // เพื่อใช้ SOCIAL_OAUTH_STATE_SECRET แยกจาก secret ของ auth token
  imports: [PrismaModule, SocialTokenModule, HttpModule, JwtModule.register({})],
  controllers: [SocialAccountController],
  providers: [
    SocialAccountService,
    MetaOAuthProvider,
    TikTokOAuthProvider,
    YouTubeOAuthProvider,
  ],
  exports: [SocialAccountService],
})
export class SocialAccountModule {}
