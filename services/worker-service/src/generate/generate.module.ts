// generate/generate.module.ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ImageProcessor } from './image.service';
import { VideoProcessor } from './video.service';
import { QUEUE_NAME_IMAGE, QUEUE_NAME_OMNIHUMEN, QUEUE_NAME_VDO, TosModule } from '@ai-media/share';
import { PrismaModule } from '@ai-media/share';
import { RedisModule } from '@nestjs-modules/ioredis';
import { OminhumenProcessor } from './ominhumen.service';

@Module({
  imports: [
    PrismaModule,
    TosModule,
    RedisModule.forRoot({
      type: 'single',
      url: `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`,
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
  ],
  controllers: [],
  providers: [ImageProcessor, VideoProcessor, OminhumenProcessor], // อย่าลืมใส่ Processor
  exports: [ImageProcessor, VideoProcessor, OminhumenProcessor],
})
export class GenerateModule {}
