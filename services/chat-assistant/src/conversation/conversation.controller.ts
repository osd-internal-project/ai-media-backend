import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseFilters,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AppErrorExceptionFilter } from '@ai-media/share';
import { ConversationService } from './conversation.service';
import {
  CreateConversationDto,
  UpdateConversationDto,
} from './dto/conversation.dto';

@ApiTags('Conversations')
@UseFilters(AppErrorExceptionFilter)
@Controller('chat-assistant/conversations')
export class ConversationController {
  constructor(private readonly conversationService: ConversationService) {}

  /**
   * POST /api/chat-assistant/conversations
   */
  @Post()
  @UsePipes(new ValidationPipe({ whitelist: true }))
  @ApiOperation({ summary: 'Create a new conversation' })
  create(@Body() dto: CreateConversationDto) {
    return this.conversationService.create(dto);
  }

  /**
   * GET /api/chat-assistant/conversations?userId=xxx&organizationId=yyy
   */
  @Get()
  @ApiOperation({ summary: 'List all conversations for a user' })
  @ApiQuery({ name: 'userId', required: true })
  @ApiQuery({ name: 'organizationId', required: false })
  findAll(
    @Query('userId') userId: string,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.conversationService.findAll(userId, organizationId);
  }

  /**
   * GET /api/chat-assistant/conversations/:id
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get a conversation by ID' })
  findOne(@Param('id') id: string) {
    return this.conversationService.findOne(id);
  }

  /**
   * GET /api/chat-assistant/conversations/:id/messages
   */
  @Get(':id/messages')
  @ApiOperation({ summary: 'Get messages in a conversation' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findMessages(
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    return this.conversationService.findMessages(
      id,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  /**
   * GET /api/chat-assistant/conversations/:id/token-usage
   */
  @Get(':id/token-usage')
  @ApiOperation({ summary: 'Get token usage summary for a conversation' })
  getTokenUsage(@Param('id') id: string) {
    return this.conversationService.getTokenUsageSummary(id);
  }

  /**
   * PATCH /api/chat-assistant/conversations/:id
   */
  @Patch(':id')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  @ApiOperation({ summary: 'Update conversation title or system prompt' })
  update(@Param('id') id: string, @Body() dto: UpdateConversationDto) {
    return this.conversationService.update(id, dto);
  }

  /**
   * DELETE /api/chat-assistant/conversations/:id
   */
  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete a conversation' })
  remove(@Param('id') id: string) {
    return this.conversationService.remove(id);
  }
}
