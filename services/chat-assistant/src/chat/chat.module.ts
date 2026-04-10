import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PrismaModule } from '@ai-media/share';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { PromptEngineeringService } from './services/prompt-engineering.service';
import { MemoryService } from './services/memory.service';
import { ToolCallingService } from './services/tool-calling.service';
import { RetryService } from './services/retry.service';
import { ModerationService } from './services/moderation.service';
import { VisionService } from './services/vision.service';

@Module({
  imports: [PrismaModule, HttpModule],
  controllers: [ChatController],
  providers: [
    ChatService,
    PromptEngineeringService,
    MemoryService,
    ToolCallingService,
    RetryService,
    ModerationService,
    VisionService,
  ],
  exports: [ChatService, VisionService],
})
export class ChatModule {}
