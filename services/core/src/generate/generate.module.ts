import { Module } from '@nestjs/common';
import { GenerateController } from './generate.controller';
import {
  QUEUE_NAME_IMAGE,
  QUEUE_NAME_VDO,
  PrismaModule,
  TosModule,
  QUEUE_NAME_OMNIHUMEN,
  QUEUE_NAME_DREAMACTOR,
} from '@ai-media/share';
import { BullModule } from '@nestjs/bullmq';
import { GenerateService } from './services/generate.service';
import { GenerateImageService } from './services/generate-image.service';
import { GenerateVideoService } from './services/generate-video.service';
import { GenerateOmnihumanService } from './services/generate-omnihuman.service';
import { GenerateDreamactorService } from './services/generate-dreamactor.service';

@Module({
  imports: [
    PrismaModule,
    TosModule,
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
  controllers: [GenerateController],
  providers: [
    GenerateService,
    GenerateImageService,
    GenerateVideoService,
    GenerateOmnihumanService,
    GenerateDreamactorService,
  ],
  exports: [
    GenerateService,
    GenerateImageService,
    GenerateVideoService,
    GenerateOmnihumanService,
    GenerateDreamactorService,
  ],
})
export class GenerateModule {}
