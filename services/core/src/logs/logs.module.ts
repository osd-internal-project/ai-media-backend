import { Module } from '@nestjs/common';
import { LogsService } from './logs.service';
import { LogsController } from './logs.controller';
import { PrismaModule } from '@ai-media/share';
import { MinioClientModule } from '../minio-client/minio-client.module';

@Module({
  imports: [PrismaModule, MinioClientModule],
  controllers: [LogsController],
  providers: [LogsService],
})
export class LogsModule { }
