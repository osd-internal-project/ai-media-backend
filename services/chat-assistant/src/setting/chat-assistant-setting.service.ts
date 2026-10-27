import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { AuthUser, PrismaService } from '@ai-media/share';

/** key ใน app_setting ของสวิตช์เปิด/ปิดผู้ช่วยแชททั้งระบบ */
export const CHAT_ASSISTANT_ENABLED_KEY = 'chat_assistant.enabled';

const SYSTEM_ADMIN_ROLES = ['SUPER_ADMIN', 'SYSTEM_ADMIN'];

@Injectable()
export class ChatAssistantSettingService {
  private readonly logger = new Logger(ChatAssistantSettingService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * ผู้ช่วยแชทเปิดอยู่หรือไม่
   *
   * ไม่มีแถว หรืออ่านไม่ได้ (เช่นยังไม่ได้ apply migration) = ปิด — ฟีเจอร์ที่ผูกกับ
   * key ของ org ต้องปิดไว้ก่อนเมื่อไม่แน่ใจ ไม่ใช่เปิดให้ทุกคนใช้
   */
  async isEnabled(): Promise<boolean> {
    try {
      const row = await this.prisma.appSetting.findUnique({
        where: { key: CHAT_ASSISTANT_ENABLED_KEY },
      });
      return row?.value === true;
    } catch (error) {
      this.logger.warn(
        `Cannot read ${CHAT_ASSISTANT_ENABLED_KEY}, treating as off: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }

  /** @throws ForbiddenException เมื่อ super admin ปิดผู้ช่วยแชทไว้ */
  async assertEnabled(): Promise<void> {
    if (!(await this.isEnabled())) {
      throw new ForbiddenException('Chat assistant is turned off');
    }
  }

  /**
   * เปิด/ปิดผู้ช่วยแชททั้งระบบ — super admin เท่านั้น
   *
   * @param authUser ผู้เรียก
   * @param enabled ค่าใหม่
   * @returns ค่าหลังบันทึก
   */
  async setEnabled(
    authUser: AuthUser | undefined,
    enabled: boolean,
  ): Promise<{ enabled: boolean }> {
    // trim ก่อนเทียบ — ข้อมูล role ในระบบมีค่าที่ติดช่องว่างท้ายอยู่จริง (เหมือน AnnouncementService)
    const role = authUser?.role?.trim();
    if (!role || !SYSTEM_ADMIN_ROLES.includes(role)) {
      throw new ForbiddenException(
        'Only a system administrator can turn the chat assistant on or off',
      );
    }

    await this.prisma.appSetting.upsert({
      where: { key: CHAT_ASSISTANT_ENABLED_KEY },
      create: { key: CHAT_ASSISTANT_ENABLED_KEY, value: enabled, updatedBy: authUser.userId },
      update: { value: enabled, updatedBy: authUser.userId },
    });
    this.logger.log(`Chat assistant turned ${enabled ? 'on' : 'off'} by ${authUser.userId}`);
    return { enabled };
  }
}
