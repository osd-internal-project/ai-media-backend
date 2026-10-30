import { Module } from '@nestjs/common';
import { GalleryService } from './gallery.service';
import { GalleryController } from './gallery.controller';
import { OrgGalleryService } from './org-gallery.service';
import { PrismaModule, TosModule, StorageModule } from '@ai-media/share';

@Module({
  imports: [PrismaModule, TosModule, StorageModule],
  controllers: [GalleryController],
  providers: [GalleryService, OrgGalleryService],
})
export class GalleryModule {}
