import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ApiKeyGuard, PrismaModule, StorageModule, TosModule } from '@ai-media/share';
import { communityConfigs } from '../configs';
import { GalleryModule } from '../gallery/gallery.module';
import { CommunityClient } from './community.client';
import {
  CommunityPublicationController,
  CommunityWebhookController,
  PublicCommunityPublicationController,
} from './community-publication.controller';
import { CommunityPublicationService } from './community-publication.service';
import {
  IntegrationApiKeyController,
  IntegrationApiKeyService,
} from './integration-api-key.controller';

@Module({
  imports: [
    PrismaModule,
    TosModule,
    StorageModule,
    GalleryModule,
    ConfigModule.forFeature(communityConfigs),
  ],
  controllers: [
    CommunityPublicationController,
    CommunityWebhookController,
    PublicCommunityPublicationController,
    IntegrationApiKeyController,
  ],
  providers: [CommunityPublicationService, CommunityClient, IntegrationApiKeyService, ApiKeyGuard],
})
export class CommunityPublicationModule {}
