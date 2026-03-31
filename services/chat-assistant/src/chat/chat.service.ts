import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '@ai-media/share';
import config from '../configs';
import { ChatRequestDto } from './dto/chat-request.dto';
import { ChatResponseDto, StreamChunkDto, TokenUsageDto } from './dto/chat-response.dto';
import { PromptEngineeringService } from './services/prompt-engineering.service';
import { MemoryService } from './services/memory.service';
import { ToolCallingService, ToolDefinition } from './services/tool-calling.service';
import { RetryService } from './services/retry.service';
import { ModerationService } from './services/moderation.service';
import { Observable, Subject } from 'rxjs';
import { firstValueFrom } from 'rxjs';
import { AxiosRequestConfig } from 'axios';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly cfg = config().openai;
  private readonly memoryCfg = config().memory;
  private readonly moderationCfg = config().moderation;

  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
    private readonly promptEngineeringService: PromptEngineeringService,
    private readonly memoryService: MemoryService,
    private readonly toolCallingService: ToolCallingService,
    private readonly retryService: RetryService,
    private readonly moderationService: ModerationService,
  ) {}

  // ─── Public: Standard (non-streaming) chat ────────────────────────────────

  async chat(dto: ChatRequestDto): Promise<ChatResponseDto> {
    // 1. Moderation on input
    await this.moderationService.checkAndThrow(
      dto.message,
      this.cfg.apiKey,
      this.cfg.baseUrl,
      this.moderationCfg.enabled,
    );

    // 2. Resolve / create conversation
    const conversation = await this.resolveConversation(dto);

    // 3. Build system prompt + messages
    const systemPrompt = this.promptEngineeringService.buildSystemPrompt({
      customSystemPrompt: dto.systemPrompt ?? conversation.systemPrompt ?? undefined,
      organizationId: dto.organizationId,
      userId: dto.userId,
    });

    const history = await this.memoryService.loadHistory(
      conversation.id,
      this.memoryCfg.maxMessages,
      this.memoryCfg.maxTokenBudget,
    );

    const messages = this.promptEngineeringService.buildMessages(
      systemPrompt,
      history,
      dto.message,
    );

    // 4. Load tools
    const dbTools = await this.toolCallingService.loadToolDefinitions();
    const requestTools: ToolDefinition[] = [
      ...dbTools,
      ...(dto.tools ?? []).map((t) => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      })),
    ];

    // 5. Save user message to DB
    const userSeq = await this.memoryService.nextSequence(conversation.id);
    const userMsg = await this.prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'user',
        content: dto.message,
        sequence: userSeq,
        metadata: dto.metadata as any,
      },
    });

    // 6. LLM call with retry
    const model = dto.model ?? this.cfg.model;
    const payload: Record<string, any> = {
      messages,
      ...(requestTools.length > 0 ? { tools: requestTools, tool_choice: 'auto' } : {}),
    };

    let llmResponse: any;
    let usedModel = model;

    try {
      const result = await this.retryService.callWithRetry({
        baseUrl: this.cfg.baseUrl,
        apiKey: this.cfg.apiKey,
        model,
        fallbackModel: this.cfg.fallbackModel,
        maxRetries: this.cfg.maxRetries,
        timeoutMs: this.cfg.timeoutMs,
        payload,
      });
      llmResponse = result.data;
      usedModel = result.usedModel;
    } catch (err: any) {
      this.logger.error(`LLM call failed: ${err.message}`);
      throw new BadRequestException(`AI service unavailable: ${err.message}`);
    }

    const choice = llmResponse.choices?.[0];
    const assistantMsg = choice?.message;
    const finishReason: string = choice?.finish_reason ?? 'stop';

    // 7. Handle tool calls (recursive single-turn)
    if (finishReason === 'tool_calls' && assistantMsg?.tool_calls) {
      return await this.handleToolCalls(
        conversation.id,
        messages,
        assistantMsg,
        llmResponse.usage,
        usedModel,
        userMsg.id,
      );
    }

    // 8. Save assistant message + token usage
    const assistantSeq = await this.memoryService.nextSequence(conversation.id);
    const savedAssistant = await this.prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'assistant',
        content: assistantMsg?.content ?? '',
        sequence: assistantSeq,
      },
    });

    const tokenUsage = await this.saveTokenUsage(
      conversation.id,
      savedAssistant.id,
      usedModel,
      llmResponse.usage,
    );

    // 9. Moderation on output (non-blocking)
    await this.moderationService.checkAndThrow(
      assistantMsg?.content ?? '',
      this.cfg.apiKey,
      this.cfg.baseUrl,
      this.moderationCfg.enabled,
    ).catch(() => {});

    return {
      conversationId: conversation.id,
      messageId: savedAssistant.id,
      content: assistantMsg?.content ?? '',
      role: 'assistant',
      tokenUsage,
      finishReason,
      createdAt: savedAssistant.createdAt,
    };
  }

  // ─── Public: SSE Streaming chat ───────────────────────────────────────────

  streamChat(query: {
    userId: string;
    message: string;
    conversationId?: string;
    organizationId?: string;
    model?: string;
  }): Observable<MessageEvent> {
    const subject = new Subject<MessageEvent>();

    this.runStreamFlow(query, subject).catch((err) => {
      const chunk: StreamChunkDto = { type: 'error', error: err.message };
      subject.next({ data: JSON.stringify(chunk) } as MessageEvent);
      subject.complete();
    });

    return subject.asObservable();
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async runStreamFlow(
    query: {
      userId: string;
      message: string;
      conversationId?: string;
      organizationId?: string;
      model?: string;
    },
    subject: Subject<MessageEvent>,
  ): Promise<void> {
    // Moderation
    await this.moderationService.checkAndThrow(
      query.message,
      this.cfg.apiKey,
      this.cfg.baseUrl,
      this.moderationCfg.enabled,
    );

    const conversation = await this.resolveConversation({
      userId: query.userId,
      message: query.message,
      conversationId: query.conversationId,
      organizationId: query.organizationId,
    });

    const systemPrompt = this.promptEngineeringService.buildSystemPrompt({
      organizationId: query.organizationId,
      userId: query.userId,
    });

    const history = await this.memoryService.loadHistory(
      conversation.id,
      this.memoryCfg.maxMessages,
      this.memoryCfg.maxTokenBudget,
    );

    const messages = this.promptEngineeringService.buildMessages(
      systemPrompt,
      history,
      query.message,
    );

    // Save user message
    const userSeq = await this.memoryService.nextSequence(conversation.id);
    await this.prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'user',
        content: query.message,
        sequence: userSeq,
      },
    });

    const model = query.model ?? this.cfg.model;

    // HTTP streaming request
    const axiosConfig: AxiosRequestConfig = {
      headers: {
        Authorization: `Bearer ${this.cfg.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      timeout: this.cfg.timeoutMs,
      responseType: 'stream',
    };

    let fullContent = '';
    let promptTokens = 0;
    let completionTokens = 0;

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.cfg.baseUrl}/chat/completions`,
          { model, messages, stream: true },
          axiosConfig,
        ),
      );

      const stream = response.data;

      await new Promise<void>((resolve, reject) => {
        let buffer = '';

        stream.on('data', (chunk: Buffer) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed === 'data: [DONE]') {
              if (trimmed === 'data: [DONE]') resolve();
              continue;
            }
            if (!trimmed.startsWith('data: ')) continue;

            try {
              const json = JSON.parse(trimmed.slice(6));
              const delta = json.choices?.[0]?.delta?.content;
              if (delta) {
                fullContent += delta;
                completionTokens += 1; // rough count
                const eventData: StreamChunkDto = { type: 'content', delta };
                subject.next({ data: JSON.stringify(eventData) } as MessageEvent);
              }
            } catch {
              // Malformed SSE chunk — ignore
            }
          }
        });

        stream.on('error', reject);
        stream.on('end', resolve);
      });

      // Estimate prompt tokens
      promptTokens = this.promptEngineeringService.estimateMessagesTokens(messages as any);
      const totalTokens = promptTokens + completionTokens;

      // Save assistant message
      const assistantSeq = await this.memoryService.nextSequence(conversation.id);
      const savedMsg = await this.prisma.chatMessage.create({
        data: {
          conversationId: conversation.id,
          role: 'assistant',
          content: fullContent,
          sequence: assistantSeq,
        },
      });

      await this.saveTokenUsage(conversation.id, savedMsg.id, model, {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens,
      });

      const doneChunk: StreamChunkDto = {
        type: 'done',
        tokenUsage: { promptTokens, completionTokens, totalTokens, model },
        conversationId: conversation.id,
        messageId: savedMsg.id,
        finishReason: 'stop',
      };
      subject.next({ data: JSON.stringify(doneChunk) } as MessageEvent);
    } catch (err: any) {
      throw new Error(`Streaming LLM call failed: ${err.message}`);
    } finally {
      subject.complete();
    }
  }

  private async handleToolCalls(
    conversationId: string,
    previousMessages: any[],
    assistantMessage: any,
    usage: any,
    usedModel: string,
    _userMessageId: string,
  ): Promise<ChatResponseDto> {
    // Save assistant's tool_calls message
    const assistantSeq = await this.memoryService.nextSequence(conversationId);
    await this.prisma.chatMessage.create({
      data: {
        conversationId,
        role: 'assistant',
        content: assistantMessage.content ?? null,
        toolCalls: assistantMessage.tool_calls,
        sequence: assistantSeq,
      },
    });

    // Execute tool calls
    const toolMessages = await this.toolCallingService.executeToolCalls(
      assistantMessage.tool_calls,
    );

    // Save tool result messages
    let seq = assistantSeq + 1;
    for (const tm of toolMessages) {
      await this.prisma.chatMessage.create({
        data: {
          conversationId,
          role: 'tool',
          content: tm.content,
          name: tm.name,
          toolCallId: tm.tool_call_id,
          sequence: seq++,
        },
      });
    }

    // Second LLM call with tool results appended
    const followUpMessages = [
      ...previousMessages,
      assistantMessage,
      ...toolMessages,
    ];

    const followUp = await this.retryService.callWithRetry({
      baseUrl: this.cfg.baseUrl,
      apiKey: this.cfg.apiKey,
      model: usedModel,
      fallbackModel: this.cfg.fallbackModel,
      maxRetries: this.cfg.maxRetries,
      timeoutMs: this.cfg.timeoutMs,
      payload: { messages: followUpMessages },
    });

    const finalChoice = followUp.data.choices?.[0];
    const finalContent = finalChoice?.message?.content ?? '';
    const finalSeq = await this.memoryService.nextSequence(conversationId);

    const savedFinal = await this.prisma.chatMessage.create({
      data: {
        conversationId,
        role: 'assistant',
        content: finalContent,
        sequence: finalSeq,
      },
    });

    const tokenUsage = await this.saveTokenUsage(
      conversationId,
      savedFinal.id,
      followUp.usedModel,
      followUp.data.usage,
    );

    return {
      conversationId,
      messageId: savedFinal.id,
      content: finalContent,
      role: 'assistant',
      tokenUsage,
      toolCalls: assistantMessage.tool_calls,
      finishReason: finalChoice?.finish_reason ?? 'stop',
      createdAt: savedFinal.createdAt,
    };
  }

  private async resolveConversation(dto: {
    userId: string;
    message?: string;
    conversationId?: string;
    organizationId?: string;
    systemPrompt?: string | null;
  }) {
    if (dto.conversationId) {
      const conv = await this.prisma.chatConversation.findUnique({
        where: { id: dto.conversationId },
      });
      if (!conv) throw new NotFoundException(`Conversation ${dto.conversationId} not found`);
      return conv;
    }

    return this.prisma.chatConversation.create({
      data: {
        userId: dto.userId,
        organizationId: dto.organizationId,
        title: dto.message
          ? dto.message.substring(0, 80)
          : 'New conversation',
        systemPrompt: dto.systemPrompt,
      },
    });
  }

  private async saveTokenUsage(
    conversationId: string,
    messageId: string,
    model: string,
    usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } = {},
  ): Promise<TokenUsageDto> {
    const promptTokens = usage.prompt_tokens ?? 0;
    const completionTokens = usage.completion_tokens ?? 0;
    const totalTokens = usage.total_tokens ?? promptTokens + completionTokens;

    await this.prisma.chatTokenUsage.create({
      data: {
        conversationId,
        messageId,
        model,
        promptTokens,
        completionTokens,
        totalTokens,
      },
    });

    return { promptTokens, completionTokens, totalTokens, model };
  }
}
