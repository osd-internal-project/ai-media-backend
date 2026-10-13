import { Controller, Get, UseFilters } from '@nestjs/common';
import { AppErrorExceptionFilter, Public } from '@ai-media/share';
import { ChatAssistantService } from './app.service';

@UseFilters(AppErrorExceptionFilter)
@Controller()
export class ChatAssistantController {
  constructor(private ChatAssistantService: ChatAssistantService) { }

  // probe ของ k8s
  @Public()
  @Get('health')
  healthCheck() {
    return { status: 'OK', service: 'chat-assistant' };
  }
}
