import { Injectable, Logger } from '@nestjs/common';
import { LlmMessage, PrismaService } from '@ai-media/share';

@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * โหลดข้อความล่าสุด N ข้อความของบทสนทนา แล้วแปลงเป็นรูปแบบที่ส่งให้โมเดลได้
   *
   * เดิมโค้ดนี้ใช้ `orderBy: sequence asc` + `take: N` ซึ่งได้ N ข้อความ "แรก"
   * ไม่ใช่ N ข้อความล่าสุดตามที่คอมเมนต์บอก ผลคือหลังคุยเกิน N รอบ ผู้ช่วยจะ
   * ย้อนอ่านแต่ตอนต้นบทสนทนาเดิมซ้ำ ๆ และไม่เห็นสิ่งที่เพิ่งคุยกันเลย
   * ที่นี่จึงดึงจากท้ายด้วย desc แล้วกลับลำดับให้เป็นเวลาเดินหน้าก่อนส่ง
   *
   * @param conversationId บทสนทนาที่ต้องการ
   * @param maxMessages จำนวนข้อความสูงสุดที่ย้อนกลับไป
   * @param maxTokenBudget เพดาน token โดยประมาณของ history
   * @returns ข้อความเรียงจากเก่าไปใหม่ พร้อมส่งให้โมเดล
   */
  async loadHistory(
    conversationId: string,
    maxMessages = 20,
    maxTokenBudget = 8000,
  ): Promise<LlmMessage[]> {
    const dbMessages = await this.prisma.chatMessage.findMany({
      where: { conversationId },
      orderBy: { sequence: 'desc' },
      take: maxMessages,
    });

    const history: LlmMessage[] = dbMessages
      .reverse()
      .map((message) => {
        const item: LlmMessage = {
          role: message.role as LlmMessage['role'],
          content: message.content,
        };
        if (message.name) item.name = message.name;
        if (message.toolCallId) item.tool_call_id = message.toolCallId;
        if (message.toolCalls) item.tool_calls = message.toolCalls as unknown[];
        return item;
      });

    const withinBudget = this.trimToBudget(history, maxTokenBudget);
    const repaired = this.dropOrphanToolMessages(withinBudget);

    this.logger.debug(
      `Loaded ${repaired.length} history messages for conversation ${conversationId}`,
    );
    return repaired;
  }

  /**
   * เลขลำดับถัดไปของข้อความในบทสนทนา
   *
   * หมายเหตุ: เป็นการอ่านแล้วเขียนโดยไม่มี unique constraint — สองคำขอพร้อมกัน
   * ในบทสนทนาเดียวกันจะได้เลขซ้ำ ในทางปฏิบัติผู้ใช้คนเดียวพิมพ์ทีละข้อความจึง
   * ยังไม่เคยชนกันจริง แต่ถ้าต้องรองรับหลาย client พร้อมกันต้องเปลี่ยนเป็น
   * unique index บน [conversationId, sequence] แล้ว retry เมื่อชน
   *
   * @param conversationId บทสนทนาที่ต้องการ
   * @returns เลขลำดับถัดไป
   */
  async nextSequence(conversationId: string): Promise<number> {
    const last = await this.prisma.chatMessage.findFirst({
      where: { conversationId },
      orderBy: { sequence: 'desc' },
      select: { sequence: true },
    });
    return (last?.sequence ?? 0) + 1;
  }

  /**
   * ตัดข้อความเก่าที่สุดออกจนอยู่ในงบ token โดยประมาณ (1 token ≈ 4 ตัวอักษร)
   *
   * @param history ข้อความเรียงจากเก่าไปใหม่
   * @param maxTokenBudget เพดานที่ยอมรับได้
   * @returns ข้อความที่อยู่ในงบแล้ว
   */
  private trimToBudget(
    history: LlmMessage[],
    maxTokenBudget: number,
  ): LlmMessage[] {
    const sizeOf = (message: LlmMessage) =>
      Math.ceil(String(message.content ?? '').length / 4);

    const trimmed = [...history];
    let total = trimmed.reduce((sum, message) => sum + sizeOf(message), 0);

    while (total > maxTokenBudget && trimmed.length > 0) {
      const removed = trimmed.shift();
      if (removed) total -= sizeOf(removed);
    }
    return trimmed;
  }

  /**
   * ทิ้งข้อความ role 'tool' ที่ขาดคู่ของมัน
   *
   * API แบบ OpenAI บังคับว่าข้อความ role 'tool' ต้องตามหลังข้อความ assistant ที่มี
   * tool_calls ซึ่งมี id ตรงกัน การตัด history ตามจำนวนหรือตามงบ token ทำให้ตัว
   * assistant หลุดออกไปแต่ตัว tool ยังอยู่ได้ แล้วคำขอทั้งก้อนจะโดนปฏิเสธด้วย 400
   * ทั้งบทสนทนา — เป็น error ที่ผู้ใช้แก้เองไม่ได้เลย
   *
   * @param history ข้อความหลังตัดงบแล้ว
   * @returns ข้อความที่คู่ tool ครบเสมอ
   */
  private dropOrphanToolMessages(history: LlmMessage[]): LlmMessage[] {
    const availableToolCallIds = new Set<string>();
    for (const message of history) {
      if (message.role !== 'assistant' || !message.tool_calls) continue;
      for (const call of message.tool_calls as { id?: string }[]) {
        if (call?.id) availableToolCallIds.add(call.id);
      }
    }

    return history.filter((message) => {
      if (message.role !== 'tool') return true;
      return Boolean(
        message.tool_call_id && availableToolCallIds.has(message.tool_call_id),
      );
    });
  }
}
