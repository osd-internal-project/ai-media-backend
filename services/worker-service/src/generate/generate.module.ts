// generate/generate.module.ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ImageProcessor } from './image.service';
import { VideoProcessor } from './video.service';
import {
    QUEUE_NAME_IMAGE,
    QUEUE_NAME_VDO,
    TosModule,
} from '@ai-media/share';
import { PrismaModule } from '@ai-media/share';
import { RedisModule } from '@nestjs-modules/ioredis';

@Module({
    imports: [
        PrismaModule, TosModule,
        RedisModule.forRoot({
            type: 'single',
            url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`,
        }),
        BullModule.registerQueue({
            name: QUEUE_NAME_IMAGE,
        }),
        BullModule.registerQueue({
            name: QUEUE_NAME_VDO,
        }),
    ],
    controllers: [],
    providers: [ImageProcessor, VideoProcessor,], // อย่าลืมใส่ Processor
    exports: [ImageProcessor, VideoProcessor,],
})
export class GenerateModule { }