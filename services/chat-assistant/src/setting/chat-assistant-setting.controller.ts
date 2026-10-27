import { Body, Controller, Get, Patch, UseFilters } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';
import { AppErrorExceptionFilter, AuthUser, CurrentUser } from '@ai-media/share';
import { ChatAssistantSettingService } from './chat-assistant-setting.service';

export class SetChatAssistantSettingDto {
  @ApiProperty({ description: 'Turn the chat assistant on or off for every user' })
  @IsBoolean()
  enabled: boolean;
}

/** สวิตช์เปิด/ปิดผู้ช่วยแชททั้งระบบ — ทุกคนอ่านได้ เปลี่ยนได้เฉพาะ super admin (ตรวจใน service) */
@ApiTags('Chat Assistant Setting')
@UseFilters(AppErrorExceptionFilter)
@Controller('chat-assistant-setting')
export class ChatAssistantSettingController {
  constructor(private readonly settingService: ChatAssistantSettingService) {}

  @Get()
  @ApiOperation({ summary: 'Whether the chat assistant is turned on' })
  async get() {
    return { enabled: await this.settingService.isEnabled() };
  }

  @Patch()
  @ApiOperation({ summary: 'Turn the chat assistant on or off (system admin only)' })
  set(
    @CurrentUser() authUser: AuthUser | undefined,
    @Body() dto: SetChatAssistantSettingDto,
  ) {
    return this.settingService.setEnabled(authUser, dto.enabled);
  }
}
