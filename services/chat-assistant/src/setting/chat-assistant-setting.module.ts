import { Module } from '@nestjs/common';
import { PrismaModule } from '@ai-media/share';
import { ChatAssistantSettingController } from './chat-assistant-setting.controller';
import { ChatAssistantSettingService } from './chat-assistant-setting.service';

@Module({
  imports: [PrismaModule],
  controllers: [ChatAssistantSettingController],
  providers: [ChatAssistantSettingService],
  exports: [ChatAssistantSettingService],
})
export class ChatAssistantSettingModule {}
