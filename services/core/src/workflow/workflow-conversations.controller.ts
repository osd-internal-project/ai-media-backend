import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { WorkflowConversationsService } from './workflow-conversations.service';
import { CreateConversationDto } from './dto/create-conversation.dto';

/**
 * REST endpoints สำหรับ WorkflowConversation
 * (เส้นทางจริงมี prefix /api ตามที่ตั้งใน main.ts)
 */
@Controller('projects/:projectId/workflow-conversations')
export class WorkflowConversationsController {
  constructor(
    private readonly conversationsService: WorkflowConversationsService,
  ) {}

  @Get()
  list(@Param('projectId') projectId: string) {
    return this.conversationsService.list(projectId);
  }

  @Post()
  create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateConversationDto,
  ) {
    return this.conversationsService.create(projectId, dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.conversationsService.findOne(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.conversationsService.remove(id);
  }
}
