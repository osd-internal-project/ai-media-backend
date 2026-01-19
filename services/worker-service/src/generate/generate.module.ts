// generate/generate.module.ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ImageProcessor } from './image.service';
import { VideoProcessor } from './video.service';
import {
    QUEUE_NAME_IMAGE,
    QUEUE_NAME_VDO,
} from '@ai-media/share';

@Module({
    imports: [
        // ลงทะเบียนชื่อคิวที่จะใช้ใน Module นี้
        BullModule.registerQueue({
            name: QUEUE_NAME_IMAGE,
        }),
        BullModule.registerQueue({
            name: QUEUE_NAME_VDO,
        }),
    ],
    controllers: [],
    providers: [ImageProcessor, VideoProcessor], // อย่าลืมใส่ Processor
    exports: [ImageProcessor, VideoProcessor],
})
export class GenerateModule { }