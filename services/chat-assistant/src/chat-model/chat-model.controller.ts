import { Controller, Get, UseFilters } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppErrorExceptionFilter } from '@ai-media/share';
import { ChatModelService } from '../chat/services/chat-model.service';

/**
 * รายชื่อโมเดลที่ผู้ใช้เลือกได้ในหน้าแชท
 *
 * อ่านอย่างเดียว และไม่มี secret อยู่ในตาราง chat_model_config เลยโดยตั้งใจ —
 * ต่างจาก GET /ai-models ของ core ที่คืน sendConfig ทั้งก้อนรวม token ของ provider
 *
 * การเพิ่ม/แก้โมเดลทำที่ระดับข้อมูล (migration หรือ SQL) ยังไม่มี CRUD ผ่าน API
 */
@ApiTags('Chat Models')
@UseFilters(AppErrorExceptionFilter)
@Controller('chat-models')
export class ChatModelController {
  constructor(private readonly chatModelService: ChatModelService) {}

  @Get()
  @ApiOperation({ summary: 'List the chat models a user can pick from' })
  findMany() {
    return this.chatModelService.listSelectable();
  }
}
