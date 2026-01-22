import { Module } from '@nestjs/common';
import { GenerateController } from './generate.controller';
import { QUEUE_NAME_IMAGE, QUEUE_NAME_VDO, PrismaModule } from '@ai-media/share';
import { BullModule } from '@nestjs/bullmq';
import { GenerateService } from './generate.service';
import { MinioClientModule } from 'src/minio-client/minio-client.module';

@Module({
  imports: [PrismaModule, MinioClientModule,
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
