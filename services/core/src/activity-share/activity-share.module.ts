import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import {
  PrismaModule,
  QUEUE_NAME_SOCIAL_PUBLISH,
  StorageModule,
  TosModule,
} from '@ai-media/share';
import { LogsModule } from '../logs/logs.module';
import { ActivityShareController } from './activity-share.controller';
import { ActivityShareService } from './activity-share.service';

@Module({
  imports: [
    PrismaModule,
    TosModule,
    StorageModule,
    LogsModule,
    BullModule.registerQueue({ name: QUEUE_NAME_SOCIAL_PUBLISH }),
  ],
  controllers: [ActivityShareController],
  providers: [ActivityShareService],
})
export class ActivityShareModule {}
