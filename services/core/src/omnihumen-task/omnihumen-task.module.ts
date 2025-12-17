import { Module } from '@nestjs/common';
import { OmnihumenTaskService } from './omnihumen-task.service';
import { OmnihumenTaskController } from './omnihumen-task.controller';
import { PrismaModule } from '@ai-media/share';

import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [PrismaModule, HttpModule],
  controllers: [OmnihumenTaskController],
  providers: [OmnihumenTaskService],
})
export class OmnihumenTaskModule {}
