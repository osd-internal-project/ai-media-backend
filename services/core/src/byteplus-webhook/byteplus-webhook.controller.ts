import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import {
  BYTEPLUS_VIDEO_CALLBACK_PATH,
  verifyByteplusCallbackSig,
  Public,
} from '@ai-media/share';
import { ByteplusWebhookService } from './byteplus-webhook.service';

/**
 * รับ callback_url จาก BytePlus Ark (Seedance 1.5 / 2.0) — public ไม่ต้อง login
 *
 * ตอบ 200 เร็วที่สุดเสมอเมื่อ sig ถูก เพื่อไม่ให้ Ark ยิงซ้ำ งานหนักทั้งหมดไปทำใน worker
 */
// BytePlus เรียกเข้ามา — ไม่มี token ของผู้ใช้
@Public()
@Controller(BYTEPLUS_VIDEO_CALLBACK_PATH)
export class ByteplusWebhookController {
  constructor(private readonly webhookService: ByteplusWebhookService) {}

  @Post(':taskId')
  @HttpCode(200)
  async video(
    @Param('taskId') taskId: string,
    @Query('sig') sig: string | undefined,
    @Body() body: unknown,
    @Headers() headers: Record<string, string>,
  ) {
    if (!verifyByteplusCallbackSig(taskId, sig)) {
      throw new UnauthorizedException('invalid callback signature');
    }
    await this.webhookService.handleVideoCallback(taskId, body, headers);
    return { ok: true };
  }
}
