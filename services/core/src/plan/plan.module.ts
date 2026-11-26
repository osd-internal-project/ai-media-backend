import { Module } from '@nestjs/common';
import { PlanService } from './plan.service';
import { PlanController } from './plan.controller';
import { PrismaModule, PrismaTransactionService } from '@ai-media/share';

@Module({
  imports: [PrismaModule],
  controllers: [PlanController],
  providers: [PlanService, PrismaTransactionService],
})
export class PlanModule {}
