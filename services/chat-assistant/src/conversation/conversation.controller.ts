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
@Controller('conversations')
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
  @Post('set')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  @ApiOperation({ summary: 'Set a conversation' })
  set(@Body() dto: CreateConversationDto) {
    return this.conversationService.set(dto);
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
   * GET /api/conversations/:id?userId=xxx
   *
   * ทุก route ที่แตะบทสนทนาใบเดียวต้องส่ง userId มาด้วย และ service จะตรวจว่าเป็น
   * เจ้าของก่อนเสมอ
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get a conversation by ID' })
  @ApiQuery({ name: 'userId', required: true })
  findOne(@Param('id') id: string, @Query('userId') userId: string) {
    return this.conversationService.findOne(id, userId);
  }

  /**
   * GET /api/conversations/:id/messages?userId=xxx
   */
  @Get(':id/messages')
  @ApiOperation({ summary: 'Get messages in a conversation' })
  @ApiQuery({ name: 'userId', required: true })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findMessages(
    @Param('id') id: string,
    @Query('userId') userId: string,
    @Query('limit') limit?: string,
  ) {
    return this.conversationService.findMessages(
      id,
      userId,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  /**
   * GET /api/conversations/:id/token-usage?userId=xxx
   */
  @Get(':id/token-usage')
  @ApiOperation({ summary: 'Get token usage summary for a conversation' })
  @ApiQuery({ name: 'userId', required: true })
  getTokenUsage(@Param('id') id: string, @Query('userId') userId: string) {
    return this.conversationService.getTokenUsageSummary(id, userId);
  }

  /**
   * PATCH /api/conversations/:id
   */
  @Patch(':id')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  @ApiOperation({ summary: 'Update conversation title or system prompt' })
  update(@Param('id') id: string, @Body() dto: UpdateConversationDto) {
    return this.conversationService.update(id, dto);
  }

  /**
   * DELETE /api/conversations/:id?userId=xxx
   */
  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete a conversation' })
  @ApiQuery({ name: 'userId', required: true })
  remove(@Param('id') id: string, @Query('userId') userId: string) {
    return this.conversationService.remove(id, userId);
  }
}
