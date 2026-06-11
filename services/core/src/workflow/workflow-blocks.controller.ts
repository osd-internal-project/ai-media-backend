import { Body, Controller, Delete, Param, Patch, Post } from '@nestjs/common';
import { WorkflowBlocksService } from './workflow-blocks.service';
import { CreateBlockDto } from './dto/create-block.dto';
import { UpdatePositionDto } from './dto/update-position.dto';

/**
 * REST endpoints สำหรับ WorkflowBlock
 * (เส้นทางจริงมี prefix /api ตามที่ตั้งใน main.ts)
 */
@Controller()
export class WorkflowBlocksController {
  constructor(private readonly blocksService: WorkflowBlocksService) {}

  @Post('workflow-conversations/:conversationId/blocks')
  create(
    @Param('conversationId') conversationId: string,
    @Body() dto: CreateBlockDto,
  ) {
    return this.blocksService.createBlock(conversationId, dto);
  }

  @Patch('workflow-blocks/:blockId/position')
  updatePosition(
    @Param('blockId') blockId: string,
    @Body() dto: UpdatePositionDto,
  ) {
    return this.blocksService.updatePosition(blockId, dto);
  }

  @Delete('workflow-blocks/:blockId')
  remove(@Param('blockId') blockId: string) {
    return this.blocksService.deleteBlock(blockId);
  }

  @Post('workflow-blocks/:blockId/retry')
  retry(@Param('blockId') blockId: string) {
    return this.blocksService.retryBlock(blockId);
  }
}
