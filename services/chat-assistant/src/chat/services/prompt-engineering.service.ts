import { Injectable, Logger } from '@nestjs/common';
import { LlmMessage, resolveChatRolePrompt } from '@ai-media/share';

// re-export ไว้เพื่อไม่ให้ไฟล์เดิมที่ import LlmMessage จากที่นี่ต้องแก้ตาม
export { LlmMessage };

@Injectable()
export class PromptEngineeringService {
  private readonly logger = new Logger(PromptEngineeringService.name);

  /**
   * ประกอบ system prompt ของคำขอนี้
   *
   * ลำดับความสำคัญ: prompt ที่ส่งมากับคำขอ → prompt ที่ผูกไว้กับบทสนทนา →
   * บทบาทตามแท็บ generate ที่เปิดอยู่
   *
   * เดิมฟังก์ชันนี้แปะ `new Date().toISOString()` ต่อท้ายทุกครั้ง ทำให้ system
   * block เปลี่ยนทุกคำขอและ prompt cache ฝั่ง provider ใช้ไม่ได้เลย ทั้งที่แชท
   * ออกแบบ prompt ไม่ได้ต้องรู้เวลาปัจจุบัน จึงเอาออก
   *
   * @param options prompt ที่ override มา และแท็บที่เปิดอยู่
   * @returns system prompt ที่จะใช้
   */
  buildSystemPrompt(options: {
    customSystemPrompt?: string | null;
    generateType?: string | null;
  }): string {
    const custom = options.customSystemPrompt?.trim();
    if (custom) return custom;

    return resolveChatRolePrompt(options.generateType);
  }

  /**
   * วาง system message ไว้หน้า history แล้วต่อท้ายด้วยข้อความใหม่ของผู้ใช้
   *
   * @param systemPrompt system prompt ของคำขอนี้
   * @param history ข้อความก่อนหน้า เรียงจากเก่าไปใหม่
   * @param userMessage ข้อความล่าสุดของผู้ใช้
   * @returns ชุดข้อความที่พร้อมส่งให้โมเดล
   */
  buildMessages(
    systemPrompt: string,
    history: LlmMessage[],
    userMessage: string,
  ): LlmMessage[] {
    const messages: LlmMessage[] = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: userMessage },
    ];
    this.logger.debug(`Built ${messages.length} messages for LLM call`);
    return messages;
  }

  /**
   * ประมาณจำนวน token แบบหยาบ (1 token ≈ 4 ตัวอักษร)
   *
   * ใช้เฉพาะการตัด history ให้อยู่ในงบเท่านั้น — ตัวเลขที่บันทึกลง
   * chat_token_usage มาจาก usage จริงที่ gateway รายงานกลับมา ไม่ใช่ค่านี้
   *
   * @param text ข้อความที่จะประมาณ
   * @returns จำนวน token โดยประมาณ
   */
  estimateTokens(text: string): number {
    return Math.ceil((text ?? '').length / 4);
  }

  /**
   * ประมาณจำนวน token ของทั้งชุดข้อความ
   *
   * @param messages ข้อความทั้งชุด
   * @returns จำนวน token โดยประมาณ
   */
  estimateMessagesTokens(messages: LlmMessage[]): number {
    return messages.reduce((sum, message) => {
      const content =
        typeof message.content === 'string' ? message.content : '';
      return sum + this.estimateTokens(content);
    }, 0);
  }
}
