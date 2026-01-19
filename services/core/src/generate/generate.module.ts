import { Module } from '@nestjs/common';
import { GenerateController } from './generate.controller';
import { QUEUE_NAME_IMAGE, QUEUE_NAME_VDO, PrismaModule } from '@ai-media/share';
import { BullModule } from '@nestjs/bullmq';
import { GenerateService } from './generate.service';

@Module({
  imports: [PrismaModule,
    BullModule.registerQueue({
      name: QUEUE_NAME_IMAGE,
    }),
    BullModule.registerQueue({
      name: QUEUE_NAME_VDO,
    }),],
  controllers: [GenerateController, GenerateService]
})
export class GenerateModule { }
