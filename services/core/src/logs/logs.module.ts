import { Module } from '@nestjs/common';
import { LogsService } from './logs.service';
import { LogsController } from './logs.controller';
import { PrismaModule, TosModule, StorageModule } from '@ai-media/share';

@Module({
  imports: [PrismaModule, TosModule, StorageModule],
  controllers: [LogsController],
  providers: [LogsService],
})
export class LogsModule {}
