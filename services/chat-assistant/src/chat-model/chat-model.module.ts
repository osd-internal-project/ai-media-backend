import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { ChatModelController } from './chat-model.controller';

/**
 * ใช้ ChatModelService ตัวเดียวกับที่ path ของแชทใช้ resolve โมเดล — รายการที่
 * ผู้ใช้เห็นกับตัวที่ backend ยอมรับจึงมาจากตรรกะเดียวกันเสมอ
 */
@Module({
  imports: [ChatModule],
  controllers: [ChatModelController],
})
export class ChatModelModule {}
