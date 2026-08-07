// generate/generate.module.ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ImageProcessor } from './image.service';
import { VideoProcessor } from './video.service';
import {
  QUEUE_NAME_DREAMACTOR,
  QUEUE_NAME_IMAGE,
  QUEUE_NAME_OMNIHUMEN,
  QUEUE_NAME_VDO,
  TosModule,
  StorageModule,
} from '@ai-media/share';
import { PrismaModule } from '@ai-media/share';
import { RedisModule } from '@nestjs-modules/ioredis';
import { OmnihumenProcessor } from './omnihumen.service';
import { DreamactorProcessor } from './dreamactor.service';
import { GenerateHelperService } from './generate-helper.service';

@Module({
  imports: [
    PrismaModule,
    TosModule,
    StorageModule,
    RedisModule.forRoot({
      type: 'single',
      url: `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`,
      ...(process.env.REDIS_PASSWORD && {
        options: {
          password: process.env.REDIS_PASSWORD,
        },
      }),
    }),
    BullModule.registerQueue({
      name: QUEUE_NAME_IMAGE,
    }),
    BullModule.registerQueue({
      name: QUEUE_NAME_VDO,
    }),
    BullModule.registerQueue({
      name: QUEUE_NAME_OMNIHUMEN,
    }),
    BullModule.registerQueue({
      name: QUEUE_NAME_DREAMACTOR,
    }),
  ],
  controllers: [],
  providers: [
    ImageProcessor,
    VideoProcessor,
    OmnihumenProcessor,
    DreamactorProcessor,
    GenerateHelperService,
  ], // อย่าลืมใส่ Processor
  exports: [
    ImageProcessor,
    VideoProcessor,
    OmnihumenProcessor,
    DreamactorProcessor,
    GenerateHelperService,
  ],
})
export class GenerateModule {}
