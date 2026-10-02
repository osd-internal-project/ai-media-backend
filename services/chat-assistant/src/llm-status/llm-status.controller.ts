import { Controller, Get, Query, UseFilters } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppErrorExceptionFilter } from '@ai-media/share';
import { LlmStatusService } from './llm-status.service';
import { LlmStatusQueryDto } from './dto/llm-status.dto';

/**
 * ตรวจว่าแชทของ org หนึ่งใช้งานได้จริงหรือไม่ ก่อนจะรู้ตอนแชทพัง
 *
 * อ่านอย่างเดียว ไม่ mint key ไม่เขียน DB และไม่คืน key เต็มออกไป
 */
@ApiTags('LLM Status')
@UseFilters(AppErrorExceptionFilter)
@Controller('llm')
export class LlmStatusController {
  constructor(private readonly llmStatusService: LlmStatusService) {}

  @Get('status')
  @ApiOperation({
    summary:
      "Report the organization's LLM gateway key and the endpoint its chat model resolves to",
  })
  getStatus(@Query() query: LlmStatusQueryDto) {
    return this.llmStatusService.getStatus(query);
  }
}
