import { Controller, Get, UseFilters } from '@nestjs/common';
import { AppErrorExceptionFilter } from '@ai-media/share';
import { ChatAssistantService } from './app.service';

@UseFilters(AppErrorExceptionFilter)
@Controller('chat-assistant')
export class ChatAssistantController {
  constructor(private ChatAssistantService: ChatAssistantService) { }

  @Get('health')
  healthCheck() {
    return { status: 'OK', service: 'chat-assistant' };
  }
}
