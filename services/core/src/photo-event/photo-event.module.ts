import { Module } from '@nestjs/common';
import {
  PrismaModule,
  PrismaTransactionService,
  StorageModule,
  TosModule,
} from '@ai-media/share';
import { GenerateModule } from '../generate/generate.module';
import { ProjectModule } from '../project/project.module';
import { PublicRateLimitGuard } from '../public-community/public-rate-limit.guard';
import { WebsocketModule } from '../websocket/websocket.module';
import { PhotoEventController } from './photo-event.controller';
import { PhotoEventAccessService } from './photo-event-access.service';
import { PhotoEventEnabledGuard } from './photo-event-enabled.guard';
import { PhotoEventEventsService } from './photo-event-events.service';
import { PhotoEventGenerationsService } from './photo-event-generations.service';
import { PhotoEventPhotosService } from './photo-event-photos.service';
import { PhotoEventPrintService } from './photo-event-print.service';
import { PhotoEventTemplatesService } from './photo-event-templates.service';
import { PhotoEventViewService } from './photo-event-view.service';
import { PublicPhotoEventController } from './public-photo-event.controller';
import { PublicPhotoEventService } from './public-photo-event.service';

/** Photo Event — นำเข้ารูป + kiosk generate + ลิงก์ download สาธารณะ */
@Module({
  imports: [
    PrismaModule,
    TosModule,
    StorageModule,
    GenerateModule,
    WebsocketModule,
    ProjectModule,
  ],
  controllers: [PhotoEventController, PublicPhotoEventController],
  providers: [
    PrismaTransactionService,
    PublicRateLimitGuard,
    PhotoEventAccessService,
    PhotoEventEnabledGuard,
    PhotoEventViewService,
    PhotoEventTemplatesService,
    PhotoEventPhotosService,
    PhotoEventPrintService,
    PhotoEventGenerationsService,
    PhotoEventEventsService,
    PublicPhotoEventService,
  ],
})
export class PhotoEventModule {}
