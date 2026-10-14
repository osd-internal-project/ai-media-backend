import { Module } from '@nestjs/common';
import { GenerateController } from './generate.controller';
import {
  QUEUE_NAME_IMAGE,
  QUEUE_NAME_VDO,
  PrismaModule,
  TosModule,
  StorageModule,
  QUEUE_NAME_OMNIHUMEN,
  QUEUE_NAME_DREAMACTOR,
  LlmGatewayModule,
} from '@ai-media/share';
import { BullModule } from '@nestjs/bullmq';
import { GenerateService } from './services/generate.service';
import { GenerateHelperService } from './services/generate-helper.service';
import { GenerateImageService } from './services/generate-image.service';
import { GenerateVideoService } from './services/generate-video.service';
import { GenerateOmnihumanService } from './services/generate-omnihuman.service';
import { GenerateDreamactorService } from './services/generate-dreamactor.service';

@Module({
  imports: [
    PrismaModule,
    TosModule,
    StorageModule,
    LlmGatewayModule,
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
    GenerateHelperService,
    GenerateImageService,
    GenerateVideoService,
    GenerateOmnihumanService,
    GenerateDreamactorService,
    GenerateService,
  ],
  exports: [
    GenerateHelperService,
    GenerateImageService,
    GenerateVideoService,
    GenerateOmnihumanService,
    GenerateDreamactorService,
    GenerateService,
  ],
})
export class GenerateModule {}
