import { Body, Controller, Inject, Post } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SendEmailDto, EMAIL_SERVICE, SEND_EMAIL_EVENT } from '@ai-media/share';

@Controller('email')
export class AppController {
  constructor(@Inject(EMAIL_SERVICE) private readonly client: ClientProxy) { }

  @Post('send')
  async sendEmail(@Body() dto: SendEmailDto) {
    // ยิงเข้า Queue แล้วจบงานทันที
    this.client.emit(SEND_EMAIL_EVENT, dto);
    return { success: true, message: 'Queued' };
  }
}