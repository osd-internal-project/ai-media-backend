import { Module } from '@nestjs/common';
import { PrismaModule, StorageModule, TosModule } from '@ai-media/share';
import { AnnouncementController } from './announcement.controller';
import { AnnouncementService } from './announcement.service';
import { PublicAnnouncementController } from './public-announcement.controller';

/** ประกาศ/ประชาสัมพันธ์บนหน้า public */
@Module({
  imports: [PrismaModule, TosModule, StorageModule],
  controllers: [AnnouncementController, PublicAnnouncementController],
  providers: [AnnouncementService],
})
export class AnnouncementModule {}
