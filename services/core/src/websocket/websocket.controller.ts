import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { NotifyInvitationDto } from './dto/notify-invitation.dto';
import { INVITATION_NOTIFY_CHANNEL } from './invitation-notify';

@Controller('websocket')
export class WebsocketController {
  constructor(@InjectRedis() private readonly redis: Redis) {}

  /** users service เรียกเมื่อคำเชิญของ email เปลี่ยน — publish ให้ทุก pod ส่งต่อทาง socket */
  @Post('notify/invitation')
  @HttpCode(202)
  async notifyInvitation(@Body() dto: NotifyInvitationDto) {
    await this.redis.publish(
      INVITATION_NOTIFY_CHANNEL,
      JSON.stringify({ email: dto.email }),
    );
    return { accepted: true };
  }
}
