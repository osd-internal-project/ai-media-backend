import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Sse,
  UseFilters,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppErrorExceptionFilter } from '@ai-media/share';
import { ChatService } from './chat.service';
import { ChatRequestDto, StreamChatQueryDto } from './dto/chat-request.dto';
import { Observable } from 'rxjs';

@ApiTags('Chat')
@UseFilters(AppErrorExceptionFilter)
@Controller('chat-assistant')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  /**
   * POST /api/chat-assistant/chat
   * Standard (non-streaming) chat completion.
   */
  @Post('chat')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  @ApiOperation({ summary: 'Send a chat message and get a full response' })
  async chat(@Body() dto: ChatRequestDto) {
    return this.chatService.chat(dto);
  }

  /**
   * GET /api/chat-assistant/chat/stream
   * Server-Sent Events streaming chat completion.
   * Use EventSource on the client to consume the streamed deltas.
   *
   * Query params: userId, message, conversationId?, organizationId?, model?
   *
   * Stream events shape:
   *   { type: 'content', delta: '...' }
   *   { type: 'done',    tokenUsage: {...}, conversationId, messageId }
   *   { type: 'error',   error: '...' }
   */
  @Sse('chat/stream')
  @ApiOperation({ summary: 'Streaming chat via Server-Sent Events (SSE)' })
  streamChat(@Query() query: StreamChatQueryDto): Observable<MessageEvent> {
    return this.chatService.streamChat({
      userId: query.userId,
      message: query.message,
      conversationId: query.conversationId,
      organizationId: query.organizationId,
      model: query.model,
    });
  }
}
