// generate/generate.module.ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ImageProcessor } from './image.service';
import { VideoProcessor } from './video.service';
import {
    QUEUE_NAME_IMAGE,
    QUEUE_NAME_VDO,
} from '@ai-media/share';
import { MinioClientModule } from 'src/minio-client/minio-client.module';
import { PrismaModule } from '@ai-media/share';

@Module({
    imports: [
        PrismaModule,
        MinioClientModule,
        BullModule.registerQueue({
            name: QUEUE_NAME_IMAGE,
        }),
    ],
    controllers: [],
    providers: [ImageProcessor, VideoProcessor,], // อย่าลืมใส่ Processor
    exports: [ImageProcessor, VideoProcessor,],
})
export class GenerateModule { }