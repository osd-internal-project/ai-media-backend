import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule, StorageModule, TosModule } from '@ai-media/share';
import { communityConfigs } from '../configs';
import { PublicCommunityController } from './public-community.controller';
import { PublicCommunityService } from './public-community.service';
import { PublicRateLimitGuard } from './public-rate-limit.guard';

@Module({
  imports: [
    PrismaModule,
    TosModule,
    StorageModule,
    ConfigModule.forFeature(communityConfigs),
  ],
  controllers: [PublicCommunityController],
  // guard เป็น singleton ของโมดูลนี้ เพื่อให้ตัวนับ in-memory ใช้ร่วมกันทุก route
  providers: [PublicCommunityService, PublicRateLimitGuard],
})
export class PublicCommunityModule {}
