import { Module } from '@nestjs/common';
import { PrismaModule } from '@ai-media/share';
import { WhtRequestService } from './wht-request.service';
import { WhtRequestController } from './wht-request.controller';

@Module({
  imports: [PrismaModule],
  controllers: [WhtRequestController],
  providers: [WhtRequestService],
  exports: [WhtRequestService],
})
export class WhtRequestModule {}
