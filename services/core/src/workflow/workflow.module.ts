import { Module } from '@nestjs/common';
import { PrismaModule, TosModule } from '@ai-media/share';
import { GenerateModule } from '../generate/generate.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { WorkflowConversationsController } from './workflow-conversations.controller';
import { WorkflowConversationsService } from './workflow-conversations.service';
import { WorkflowBlocksController } from './workflow-blocks.controller';
import { WorkflowBlocksService } from './workflow-blocks.service';
import { WorkflowEventsService } from './workflow-events.service';
import { WorkflowMediaService } from './workflow-media.service';

/**
 * โมดูล Workflow — แยกอิสระจากฟีเจอร์ Gen Image / Gen Video เดิม
 *
 * - PrismaModule: ใช้ repository ที่ share ไว้ (WorkflowConversation/Block, Log, Gallery)
 * - GenerateModule: เรียก GenerateService เดิมเพื่อ reuse pipeline (ไม่สร้างคิวใหม่)
 * - WebsocketModule: ใช้ WebsocketGatewayService เดิม (socket.io server ตัวเดียวกับที่ client
 *   เชื่อมต่อ) เพื่อ broadcast `workflow.block.updated` ได้จริง — ไม่ใช้ gateway แยก
 */
@Module({
  imports: [PrismaModule, TosModule, GenerateModule, WebsocketModule],
  controllers: [WorkflowConversationsController, WorkflowBlocksController],
  providers: [
    WorkflowConversationsService,
    WorkflowBlocksService,
    WorkflowEventsService,
    WorkflowMediaService,
  ],
})
export class WorkflowModule {}
