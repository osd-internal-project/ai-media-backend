import { Module } from '@nestjs/common';
import { PrismaModule } from '@ai-media/share';
import { GenerateModule } from '../generate/generate.module';
import { WorkflowConversationsController } from './workflow-conversations.controller';
import { WorkflowConversationsService } from './workflow-conversations.service';
import { WorkflowBlocksController } from './workflow-blocks.controller';
import { WorkflowBlocksService } from './workflow-blocks.service';
import { WorkflowEventsService } from './workflow-events.service';
import { WorkflowGateway } from './workflow.gateway';

/**
 * โมดูล Workflow — แยกอิสระจากฟีเจอร์ Gen Image / Gen Video เดิม
 *
 * - PrismaModule: ใช้ repository ที่ share ไว้ (WorkflowConversation/Block, Log, Gallery)
 * - GenerateModule: เรียก GenerateService เดิมเพื่อ reuse pipeline (ไม่สร้างคิวใหม่)
 */
@Module({
  imports: [PrismaModule, GenerateModule],
  controllers: [WorkflowConversationsController, WorkflowBlocksController],
  providers: [
    WorkflowConversationsService,
    WorkflowBlocksService,
    WorkflowEventsService,
    WorkflowGateway,
  ],
})
export class WorkflowModule {}
