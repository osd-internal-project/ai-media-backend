import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ApiKeyGuard, PrismaModule, StorageModule, TosModule } from '@ai-media/share';
import { communityConfigs } from '../configs';
import { GalleryModule } from '../gallery/gallery.module';
import {
  CommunityPublicationController,
  IntegrationPublicationController,
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
    PublicCommunityPublicationController,
    IntegrationApiKeyController,
    IntegrationPublicationController,
  ],
  providers: [CommunityPublicationService, IntegrationApiKeyService, ApiKeyGuard],
})
export class CommunityPublicationModule {}
