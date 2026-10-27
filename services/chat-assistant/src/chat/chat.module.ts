import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { LlmGatewayModule, PrismaModule } from '@ai-media/share';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { PromptEngineeringService } from './services/prompt-engineering.service';
import { MemoryService } from './services/memory.service';
import { ToolCallingService } from './services/tool-calling.service';
import { ChatModelService } from './services/chat-model.service';
import { VisionService } from './services/vision.service';
import { ChatAssistantSettingModule } from '../setting/chat-assistant-setting.module';

/**
 * HttpModule ยังอยู่เพราะ VisionService ใช้ — ส่วน path ของแชทย้ายไปใช้
 * LlmChatService จาก LlmGatewayModule แล้ว
 */
@Module({
  imports: [PrismaModule, HttpModule, LlmGatewayModule, ChatAssistantSettingModule],
  controllers: [ChatController],
  providers: [
    ChatService,
    PromptEngineeringService,
    MemoryService,
    ToolCallingService,
    ChatModelService,
    VisionService,
  ],
  exports: [ChatService, VisionService, ChatModelService],
})
export class ChatModule {}
