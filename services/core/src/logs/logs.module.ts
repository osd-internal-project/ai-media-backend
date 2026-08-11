import { Module } from '@nestjs/common';
import { LogsService } from './logs.service';
import { LogsController } from './logs.controller';
import { PrismaModule, TosModule, StorageModule } from '@ai-media/share';

@Module({
  imports: [PrismaModule, TosModule, StorageModule],
  controllers: [LogsController],
  providers: [LogsService],
  // export ให้ module อื่นเรียก logAudit ได้ (activity-share ใช้)
  exports: [LogsService],
})
export class LogsModule {}
