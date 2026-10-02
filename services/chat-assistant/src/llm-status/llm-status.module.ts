import { Module } from '@nestjs/common';
import { LlmGatewayModule, PrismaModule } from '@ai-media/share';
import { ChatModule } from '../chat/chat.module';
import { LlmStatusController } from './llm-status.controller';
import { LlmStatusService } from './llm-status.service';

/**
 * ใช้ ChatModelService ตัวเดียวกับ path ของแชท — สถานะที่รายงานจึงเป็นของโมเดล
 * ตัวที่แชทจะใช้จริง ไม่ใช่ตัวที่คำนวณด้วยตรรกะคนละชุด
 */
@Module({
  imports: [PrismaModule, LlmGatewayModule, ChatModule],
  controllers: [LlmStatusController],
  providers: [LlmStatusService],
})
export class LlmStatusModule {}
