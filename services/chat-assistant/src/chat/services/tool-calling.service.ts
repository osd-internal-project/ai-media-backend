import { Injectable, Logger } from '@nestjs/common';
import { LlmMessage, PrismaService } from '@ai-media/share';

/**
 * ผลลัพธ์ของ tool 1 ตัว ในรูปข้อความที่ส่งกลับให้โมเดลได้
 *
 * แคบกว่า LlmMessage ตรงที่ content เป็น string เสมอ — ผลของ tool ถูก serialize
 * เป็นสตริงทุกกรณีอยู่แล้ว การประกาศให้ตรงตามนั้นทำให้ผู้เรียกไม่ต้อง cast
 */
export interface ToolResultMessage extends LlmMessage {
  role: 'tool';
  content: string;
  tool_call_id: string;
  name: string;
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters: Record<string, any>;
  };
}

export interface ToolCallResult {
  tool_call_id: string;
  name: string;
  content: string;
}

/**
 * Registry of built-in tool handlers.
 * Add new handlers here by key matching the ChatTool.handler field.
 */
type ToolHandler = (args: Record<string, any>) => Promise<string>;

@Injectable()
export class ToolCallingService {
  private readonly logger = new Logger(ToolCallingService.name);

  private readonly handlers: Record<string, ToolHandler> = {
    // Example built-in handler
    get_current_time: async () => new Date().toISOString(),
  };

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Load active tool definitions from the DB (formatted for OpenAI API).
   */
  async loadToolDefinitions(): Promise<ToolDefinition[]> {
    const tools = await this.prisma.chatTool.findMany({
      where: { isActive: true },
    });

    return tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description ?? undefined,
        parameters: t.parameters as Record<string, any>,
      },
    }));
  }

  /**
   * Execute tool calls returned by the LLM and return tool-role messages.
   */
  async executeToolCalls(
    toolCalls: Array<{ id: string; function: { name: string; arguments: string } }>,
  ): Promise<ToolResultMessage[]> {
    const results: ToolResultMessage[] = [];

    for (const call of toolCalls) {
      const fnName = call.function.name;
      let resultContent: string;

      try {
        const args = JSON.parse(call.function.arguments ?? '{}');
        const handler = this.handlers[fnName];

        if (handler) {
          resultContent = await handler(args);
        } else {
          this.logger.warn(`No handler registered for tool: ${fnName}`);
          resultContent = JSON.stringify({ error: `Tool "${fnName}" is not implemented.` });
        }
      } catch (err: any) {
        this.logger.error(`Tool execution error for ${fnName}: ${err.message}`);
        resultContent = JSON.stringify({ error: err.message });
      }

      results.push({
        role: 'tool',
        tool_call_id: call.id,
        name: fnName,
        content: resultContent,
      });
    }

    return results;
  }

  /**
   * Register a custom in-memory tool handler at runtime.
   */
  registerHandler(name: string, handler: ToolHandler): void {
    this.handlers[name] = handler;
    this.logger.log(`Registered tool handler: ${name}`);
  }
}
