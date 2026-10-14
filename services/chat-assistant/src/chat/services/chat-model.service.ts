import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ChatModelConfigRepository, ChatSendConfig } from '@ai-media/share';

/** พารามิเตอร์ของโมเดลที่ resolve แล้ว พร้อมส่งให้ gateway */
export interface ResolvedChatModel {
  readonly modelId: string;
  readonly temperature: number;
  readonly maxTokens: number;
  readonly supportsVision: boolean;
  /** ปลายทางจาก chat_model_config.send_api — null = ใช้ค่าจาก env */
  readonly sendApi: string | null;
  readonly sendConfig: ChatSendConfig | null;
}

@Injectable()
export class ChatModelService {
  private readonly logger = new Logger(ChatModelService.name);

  constructor(private readonly repo: ChatModelConfigRepository) {}

  /**
   * รายการโมเดลที่เลือกได้ในหน้าแชท
   *
   * @returns โมเดลที่เปิดใช้งาน เรียงตาม sortOrder
   */
  async listSelectable() {
    const rows = await this.repo.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { displayName: 'asc' }],
    });

    // เลือกคืนเฉพาะ field ที่ frontend ใช้ — ห้ามเติม sendApi / sendConfig เข้ามา
    // เด็ดขาด sendConfig ถือ token สำรองของโมเดลได้
    return rows.map((row) => ({
      modelId: row.modelId,
      displayName: row.displayName,
      description: row.description,
      supportsVision: row.supportsVision,
      isDefault: row.isDefault,
    }));
  }

  /**
   * หาโมเดลที่จะใช้ในคำขอนี้
   *
   * ลำดับ: modelId ที่ระบุมา → โมเดล default → โมเดลแรกที่เปิดใช้งาน
   * โมเดลที่ระบุมาแล้วหาไม่เจอถือเป็น error ไม่ใช่เงียบ ๆ ตกไปใช้ default —
   * ผู้ใช้เลือกโมเดลไว้แล้วได้คำตอบจากอีกโมเดลโดยไม่รู้ตัวคือพฤติกรรมที่แย่กว่า
   *
   * @param modelId โมเดลที่ผู้ใช้เลือก (ไม่ระบุก็ได้)
   * @returns พารามิเตอร์ของโมเดลที่จะใช้
   * @throws BadRequestException เมื่อระบุโมเดลที่ไม่มีอยู่ หรือยังไม่ได้ตั้งค่าโมเดลใดเลย
   */
  async resolve(modelId?: string | null): Promise<ResolvedChatModel> {
    if (modelId) {
      const requested = await this.repo.findUnique({ where: { modelId } });
      if (!requested || !requested.isActive) {
        throw new BadRequestException(
          `Chat model "${modelId}" is not available`,
        );
      }
      return this.toResolved(requested);
    }

    const fallback =
      (await this.repo.findOne({ where: { isActive: true, isDefault: true } })) ??
      (await this.repo.findOne({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      }));

    if (!fallback) {
      this.logger.error('No active row in chat_model_config');
      throw new BadRequestException(
        'No chat model is configured. Ask an administrator to add one.',
      );
    }
    return this.toResolved(fallback);
  }

  /**
   * แปลงแถวจาก DB เป็นพารามิเตอร์ที่ใช้ส่งจริง
   *
   * temperature เก็บเป็น Decimal ของ Prisma จึงต้องแปลงเป็น number ก่อน —
   * ส่ง Decimal เข้า JSON.stringify ตรง ๆ จะได้สตริง ซึ่ง gateway ปฏิเสธ
   *
   * @param row แถวจาก chat_model_config
   * @returns พารามิเตอร์ที่ normalize แล้ว
   */
  private toResolved(row: {
    modelId: string;
    temperature: unknown;
    maxTokens: number;
    supportsVision: boolean;
    sendApi: string;
    sendConfig: unknown;
  }): ResolvedChatModel {
    const sendApi = row.sendApi?.trim();
    return {
      modelId: row.modelId,
      temperature: Number(row.temperature),
      maxTokens: row.maxTokens,
      supportsVision: row.supportsVision,
      sendApi: sendApi ? sendApi : null,
      sendConfig: this.toSendConfig(row.sendConfig),
    };
  }

  /**
   * อ่าน send_config ที่เป็น Json ของ Prisma ให้เป็นรูปที่ใช้ได้
   *
   * ค่าในคอลัมน์ Json เป็นอะไรก็ได้ (array, string, null) จึงต้องกันไว้ก่อน —
   * ส่ง array เข้าไปเป็น sendConfig แล้ว `sendConfig.headers` จะเป็น undefined
   * เงียบ ๆ แทนที่จะรู้ว่าข้อมูลตั้งไว้ผิด
   *
   * @param value ค่าดิบจากคอลัมน์ send_config
   * @returns config ที่ใช้ได้ หรือ null เมื่อไม่ใช่ object
   */
  private toSendConfig(value: unknown): ChatSendConfig | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      if (value !== null && value !== undefined) {
        this.logger.warn(
          `Ignoring chat_model_config.send_config that is not an object: ${JSON.stringify(value)}`,
        );
      }
      return null;
    }
    return value as ChatSendConfig; // narrow แล้วว่าเป็น object ธรรมดา field ทุกตัวเป็น optional
  }
}
