import { Module } from '@nestjs/common';
import {
  PrismaModule,
  SocialTokenModule,
  StorageModule,
  TosModule,
} from '@ai-media/share';
import { SocialPublishProcessor } from './social-publish.processor';
import { PublisherRegistry } from './publishers/publisher.registry';
import { FacebookPublisher } from './publishers/facebook.publisher';
import { InstagramPublisher } from './publishers/instagram.publisher';
import { TikTokPublisher } from './publishers/tiktok.publisher';
import { YouTubePublisher } from './publishers/youtube.publisher';

@Module({
  imports: [PrismaModule, TosModule, StorageModule, SocialTokenModule],
  providers: [
    SocialPublishProcessor,
    PublisherRegistry,
    FacebookPublisher,
    InstagramPublisher,
    TikTokPublisher,
    YouTubePublisher,
  ],
})
export class SocialPublishModule {}
