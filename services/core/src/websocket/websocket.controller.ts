import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  Post,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { NotifyInvitationDto } from './dto/notify-invitation.dto';
import { INVITATION_NOTIFY_CHANNEL } from './invitation-notify';
import { Public, authMode } from '@ai-media/share';

// service-to-service (users) — ตรวจ x-internal-key แทน
@Public()
@Controller('websocket')
export class WebsocketController {
  constructor(@InjectRedis() private readonly redis: Redis) {}

  /** users service เรียกเมื่อคำเชิญของ email เปลี่ยน — publish ให้ทุก pod ส่งต่อทาง socket */
  @Post('notify/invitation')
  @HttpCode(202)
  async notifyInvitation(
    @Body() dto: NotifyInvitationDto,
    @Headers('x-internal-key') key?: string,
  ) {
    assertInternalKey(key);
    await this.redis.publish(
      INVITATION_NOTIFY_CHANNEL,
      JSON.stringify({ email: dto.email }),
    );
    return { accepted: true };
  }
}

/**
 * endpoint นี้เปิดผ่าน ingress เดียวกับ API อื่น — ต้องมี `INTERNAL_API_KEY` ที่ users ส่งมา
 * ยังไม่ตั้ง secret: ยอมไว้ก่อนเฉพาะตอน AUTH_MODE ยังไม่ใช่ enforce (ช่วง rollout)
 */
function assertInternalKey(key: string | undefined): void {
  const expected = process.env.INTERNAL_API_KEY;
  if (!expected) {
    if (authMode() === 'enforce') {
      throw new ForbiddenException('INTERNAL_API_KEY is not configured');
    }
    return;
  }
  const given = Buffer.from(key ?? '');
  const wanted = Buffer.from(expected);
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) {
    throw new ForbiddenException('Invalid internal key');
  }
}
