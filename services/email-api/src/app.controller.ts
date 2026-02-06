import { Body, Controller, Post } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { SendEmailDto, EMAIL_QUEUE, SEND_EMAIL_EVENT } from '@ai-media/share';

@Controller('email')
export class AppController {
  constructor(@InjectQueue(EMAIL_QUEUE) private readonly queue: Queue) { }

  @Post('send')
  async sendEmail(@Body() dto: SendEmailDto) {
    // ยิงเข้า Queue แล้วจบงานทันที
    await this.queue.add(SEND_EMAIL_EVENT, dto);
    return { success: true, message: 'Queued' };
  }
}