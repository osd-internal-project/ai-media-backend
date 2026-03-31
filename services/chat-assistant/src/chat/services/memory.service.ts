import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@ai-media/share';
import { LlmMessage } from './prompt-engineering.service';

@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Load the last N messages for a conversation and return them as LLM messages.
   * Trims context to stay within the approximate token budget.
   */
  async loadHistory(
    conversationId: string,
    maxMessages: number = 20,
    maxTokenBudget: number = 8000,
  ): Promise<LlmMessage[]> {
    const dbMessages = await this.prisma.chatMessage.findMany({
      where: { conversationId },
      orderBy: { sequence: 'asc' },
      take: maxMessages,
    });

    const history: LlmMessage[] = dbMessages.map((m) => {
      const msg: LlmMessage = {
        role: m.role as any,
        content: m.content,
      };
      if (m.name) msg.name = m.name;
      if (m.toolCallId) msg.tool_call_id = m.toolCallId;
      if (m.toolCalls) msg.tool_calls = m.toolCalls as any[];
      return msg;
    });

    // Trim from the front until we are within token budget (rough 4-char/token estimate)
    let totalTokens = history.reduce(
      (sum, m) => sum + Math.ceil(((m.content ?? '') + '').length / 4),
      0,
    );

    while (totalTokens > maxTokenBudget && history.length > 0) {
      const removed = history.shift();
      if (removed) {
        totalTokens -= Math.ceil(((removed.content ?? '') + '').length / 4);
      }
    }

    this.logger.debug(
      `Loaded ${history.length} history messages (~${totalTokens} tokens) for conversation ${conversationId}`,
    );
    return history;
  }

  /**
   * Get the next sequence number for a conversation.
   */
  async nextSequence(conversationId: string): Promise<number> {
    const last = await this.prisma.chatMessage.findFirst({
      where: { conversationId },
      orderBy: { sequence: 'desc' },
      select: { sequence: true },
    });
    return (last?.sequence ?? 0) + 1;
  }
}
