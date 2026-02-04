import { Module } from '@nestjs/common';
import { GenerateController } from './generate.controller';
import { QUEUE_NAME_IMAGE, QUEUE_NAME_VDO, PrismaModule, TosModule } from '@ai-media/share';
import { BullModule } from '@nestjs/bullmq';
import { GenerateService } from './generate.service';

@Module({
  imports: [PrismaModule, TosModule,
    BullModule.registerQueue({
      name: QUEUE_NAME_IMAGE,
    }),
    BullModule.registerQueue({
      name: QUEUE_NAME_VDO,
    }),
  ],
  controllers: [GenerateController],
  providers: [GenerateService],
})
export class GenerateModule { }
