import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Observable, Subject, finalize } from 'rxjs';
import {
  LlmChatRequest,
  LlmChatService,
  LlmGatewayService,
  LlmMessage,
  LlmUsage,
  OrganizationMemberRepository,
  PrismaService,
} from '@ai-media/share';
import config from '../configs';
import { ChatRequestDto } from './dto/chat-request.dto';
import {
  ChatResponseDto,
  StreamChunkDto,
  TokenUsageDto,
} from './dto/chat-response.dto';
import { PromptEngineeringService } from './services/prompt-engineering.service';
import { MemoryService } from './services/memory.service';
import { ToolCallingService, ToolDefinition } from './services/tool-calling.service';
import { ChatModelService, ResolvedChatModel } from './services/chat-model.service';
import { ChatAssistantSettingService } from '../setting/chat-assistant-setting.service';

/** พารามิเตอร์ที่ทั้ง path ปกติและ path stream ใช้ร่วมกัน */
interface ChatTurnInput {
  userId: string;
  organizationId: string;
  message: string;
  conversationId?: string;
  generateType?: string;
  systemPrompt?: string;
  model?: string;
  projectId?: string;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly memoryCfg = config().memory;

  constructor(
    private readonly prisma: PrismaService,
    private readonly promptEngineeringService: PromptEngineeringService,
    private readonly memoryService: MemoryService,
    private readonly toolCallingService: ToolCallingService,
    private readonly chatModelService: ChatModelService,
    private readonly llmChat: LlmChatService,
    private readonly llmGateway: LlmGatewayService,
    private readonly orgMemberRepo: OrganizationMemberRepository,
    private readonly setting: ChatAssistantSettingService,
  ) {}

  // ==========================================================================
  // แชทแบบรอจนจบ
  // ==========================================================================

  /**
   * ตอบข้อความ 1 รอบ
   *
   * ไม่มีการหักเครดิตที่ใดในเส้นทางนี้โดยตั้งใจ — ผู้ช่วยแชทเป็นเครื่องมือช่วยร่าง
   * prompt ไม่ใช่การ generate ที่คิดเงิน ค่าใช้จ่ายไปผูกกับ key ของ org ที่ฝั่ง
   * gateway แทน (chat_token_usage เก็บไว้ดูปริมาณเท่านั้น)
   *
   * @param dto คำขอจาก frontend
   * @returns คำตอบของผู้ช่วย พร้อม token ที่ใช้จริง
   */
  async chat(dto: ChatRequestDto): Promise<ChatResponseDto> {
    const input: ChatTurnInput = {
      userId: dto.userId,
      organizationId: dto.organizationId,
      message: dto.message,
      conversationId: dto.conversationId,
      generateType: dto.generateType,
      systemPrompt: dto.systemPrompt,
      model: dto.model,
    };

    const { conversation, messages, model, apiKey } =
      await this.prepareTurn(input);

    const dbTools = await this.toolCallingService.loadToolDefinitions();
    const requestTools: ToolDefinition[] = [
      ...dbTools,
      ...(dto.tools ?? []).map((tool) => ({
        type: 'function' as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      })),
    ];

    const userMessage = await this.persistMessage(conversation.id, {
      role: 'user',
      content: dto.message,
      metadata: dto.metadata,
    });

    let result: Awaited<ReturnType<LlmChatService['complete']>>;
    try {
      result = await this.llmChat.complete({
        apiKey,
        ...this.toLlmModelParams(model),
        messages,
        tools: requestTools.length > 0 ? requestTools : undefined,
      });
    } catch (error) {
      this.logger.error(
        `LLM call failed for conversation ${conversation.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new BadRequestException(
        error instanceof Error ? error.message : 'AI service unavailable',
      );
    }

    if (result.finishReason === 'tool_calls' && result.toolCalls) {
      return this.handleToolCalls({
        conversationId: conversation.id,
        previousMessages: messages,
        toolCalls: result.toolCalls,
        assistantContent: result.content,
        firstUsage: result.usage,
        model,
        apiKey,
      });
    }

    const assistantMessage = await this.persistMessage(conversation.id, {
      role: 'assistant',
      content: result.content,
    });

    const tokenUsage = await this.saveTokenUsage(
      conversation.id,
      assistantMessage.id,
      result.model,
      result.usage,
    );

    await this.rememberModel(conversation.id, model.modelId, userMessage.id);

    return {
      conversationId: conversation.id,
      messageId: assistantMessage.id,
      content: result.content,
      role: 'assistant',
      tokenUsage,
      finishReason: result.finishReason ?? 'stop',
      createdAt: assistantMessage.createdAt,
    };
  }

  // ==========================================================================
  // แชทแบบ stream (SSE)
  // ==========================================================================

  /**
   * ตอบข้อความแบบทยอยส่งทีละชิ้น
   *
   * @param query พารามิเตอร์จาก query string ของ EventSource
   * @returns Observable ของ SSE event
   */
  streamChat(query: ChatTurnInput): Observable<MessageEvent> {
    const subject = new Subject<MessageEvent>();
    // Nest unsubscribe เมื่อ client ปิด — ยกเลิกคำขอที่ gateway ด้วย ไม่งั้นโมเดล generate ต่อจนจบและคิดเงิน
    const abort = new AbortController();

    this.runStreamFlow(query, subject, abort.signal)
      .catch((error) => {
        if (abort.signal.aborted) {
          this.logger.log('Stream cancelled by client');
          return;
        }
        // ต้องส่ง error chunk ก่อน complete เสมอ — โค้ดเดิมมี finally ที่ complete
        // ไปแล้วตั้งแต่ก่อน catch นี้ทำงาน ทำให้ subject.next() กลายเป็น no-op
        // และฝั่ง client เห็นแค่ stream เงียบไปเฉย ๆ โดยไม่รู้ว่าพัง
        const chunk: StreamChunkDto = {
          type: 'error',
          error: error instanceof Error ? error.message : String(error),
        };
        subject.next({ data: JSON.stringify(chunk) } as MessageEvent);
      })
      .finally(() => subject.complete());

    return subject.asObservable().pipe(finalize(() => abort.abort()));
  }

  // ==========================================================================
  // Internals
  // ==========================================================================

  /**
   * งานเตรียมที่เหมือนกันทั้งสอง path: ตรวจสิทธิ์ หา key หาโมเดล ประกอบข้อความ
   *
   * @param input พารามิเตอร์ของรอบสนทนานี้
   * @returns บทสนทนา ข้อความที่จะส่ง โมเดล และ key ที่จะใช้
   */
  private async prepareTurn(input: ChatTurnInput) {
    await this.setting.assertEnabled();
    await this.assertOrgMember(input.organizationId, input.userId);

    const conversation = await this.resolveConversation(input);
    const model = await this.chatModelService.resolve(
      input.model ?? conversation.model,
    );

    // key ของ org เอง ไม่ใช่ key กลางใบเดียวเหมือนเดิม — mint ให้อัตโนมัติถ้ายังไม่มี
    // ตกไปใช้ token ของโมเดลได้เมื่อ mint ไม่สำเร็จ ลำดับเดียวกับ generate image
    const apiKey = await this.llmGateway.getOrCreateApiKey(
      input.organizationId,
    );
    if (!apiKey && !model.sendConfig?.authorization) {
      throw new BadRequestException(
        'No LLM gateway key is available for this organization',
      );
    }

    const systemPrompt = this.promptEngineeringService.buildSystemPrompt({
      customSystemPrompt: input.systemPrompt ?? conversation.systemPrompt,
      generateType: input.generateType,
    });

    const history = await this.memoryService.loadHistory(
      conversation.id,
      this.memoryCfg.maxMessages,
      this.memoryCfg.maxTokenBudget,
    );

    const messages = this.promptEngineeringService.buildMessages(
      systemPrompt,
      history,
      input.message,
    );

    // ว่างได้เมื่อโมเดลมี token สำรอง — LlmChatService จะเลือก sendConfig.authorization ให้
    return { conversation, messages, model, apiKey: apiKey ?? '' };
  }

  /**
   * เดินงาน stream ทั้งรอบ
   *
   * @param query พารามิเตอร์ของรอบสนทนานี้
   * @param subject ช่องทางส่ง SSE event กลับ
   * @param signal ยกเลิกเมื่อ client ปิดการเชื่อมต่อ
   */
  private async runStreamFlow(
    query: ChatTurnInput,
    subject: Subject<MessageEvent>,
    signal: AbortSignal,
  ): Promise<void> {
    const { conversation, messages, model, apiKey } =
      await this.prepareTurn(query);

    await this.persistMessage(conversation.id, {
      role: 'user',
      content: query.message,
    });

    const { fullContent, usage, usedModel, finishReason } =
      await this.emitAnswer(
        { apiKey, ...this.toLlmModelParams(model), messages },
        model,
        subject,
        signal,
      );

    const assistantMessage = await this.persistMessage(conversation.id, {
      role: 'assistant',
      content: fullContent,
    });

    const tokenUsage = await this.saveTokenUsage(
      conversation.id,
      assistantMessage.id,
      usedModel,
      usage ??
        // gateway ไม่ส่ง usage มา (เช่นตัดกลางคัน) — บันทึกค่าประมาณไว้ ดีกว่าไม่บันทึก
        {
          promptTokens: this.promptEngineeringService.estimateMessagesTokens(
            messages,
          ),
          completionTokens:
            this.promptEngineeringService.estimateTokens(fullContent),
          totalTokens: 0,
        },
    );

    await this.rememberModel(conversation.id, model.modelId);

    const doneChunk: StreamChunkDto = {
      type: 'done',
      tokenUsage,
      conversationId: conversation.id,
      messageId: assistantMessage.id,
      finishReason,
    };
    subject.next({ data: JSON.stringify(doneChunk) } as MessageEvent);
  }

  /**
   * แปลงโมเดลที่ resolve แล้วเป็นพารามิเตอร์ของคำขอ
   *
   * รวม sendApi/sendConfig ของแถวนั้นไปด้วยเสมอ — ปลายทางเป็นของโมเดล ไม่ใช่ของ
   * process จึงต้องเดินทางไปพร้อมกันทุกจุดที่เรียก ไม่งั้นจะมี path ที่หลุดไปใช้ env
   *
   * @param model โมเดลที่ resolve แล้ว
   * @returns field ที่ spread ลง LlmChatRequest ได้ตรง ๆ
   */
  private toLlmModelParams(model: ResolvedChatModel) {
    return {
      model: model.modelId,
      temperature: model.temperature,
      maxTokens: model.maxTokens,
      sendApi: model.sendApi ?? undefined,
      sendConfig: model.sendConfig ?? undefined,
    };
  }

  /**
   * ส่งคำตอบออกทาง SSE แล้วคืนเนื้อหาที่ประกอบครบแล้ว
   *
   * โมเดลที่ตั้ง `sendConfig.stream = false` ไว้จะถูกเรียกแบบรอจนจบแล้วส่งออกเป็น
   * ก้อนเดียว — ยิง `stream: true` ใส่ปลายทางที่ไม่รองรับทำให้ client เห็นแค่
   * stream ที่พังกลางคัน ซึ่งแยกไม่ออกจาก network ขาด
   *
   * @param request พารามิเตอร์ที่จะส่งให้ gateway
   * @param model โมเดลที่ resolve แล้ว (ใช้ดู sendConfig.stream)
   * @param subject ช่องทางส่ง SSE event
   * @param signal ยกเลิกเมื่อ client ปิดการเชื่อมต่อ
   * @returns เนื้อหาเต็ม usage โมเดลที่ gateway ใช้จริง และเหตุที่จบ
   */
  private async emitAnswer(
    request: LlmChatRequest,
    model: ResolvedChatModel,
    subject: Subject<MessageEvent>,
    signal: AbortSignal,
  ): Promise<{
    fullContent: string;
    usage: LlmUsage | null;
    usedModel: string;
    finishReason: string;
  }> {
    const send = (delta: string) => {
      const chunk: StreamChunkDto = { type: 'content', delta };
      subject.next({ data: JSON.stringify(chunk) } as MessageEvent);
    };

    if (model.sendConfig?.stream === false) {
      const result = await this.llmChat.complete(request);
      if (result.content) send(result.content);
      return {
        fullContent: result.content,
        usage: result.usage,
        usedModel: result.model,
        finishReason: result.finishReason ?? 'stop',
      };
    }

    let fullContent = '';
    let usage: LlmUsage | null = null;
    let usedModel = model.modelId;
    let finishReason = 'stop';

    for await (const event of this.llmChat.stream(request, signal)) {
      if (event.type === 'delta') {
        fullContent += event.content;
        send(event.content);
        continue;
      }
      if (event.type === 'finish') {
        finishReason = event.finishReason;
        continue;
      }
      // usage มาเป็นก้อนสุดท้ายจาก gateway — ใช้ค่านี้แทนการนับ chunk เอง
      usage = event.usage;
      usedModel = event.model;
    }

    return { fullContent, usage, usedModel, finishReason };
  }

  /**
   * รอบที่สองหลังโมเดลขอเรียก tool
   *
   * @param input บริบทของรอบแรก
   * @returns คำตอบสุดท้ายหลังได้ผลลัพธ์ tool แล้ว
   */
  private async handleToolCalls(input: {
    conversationId: string;
    previousMessages: LlmMessage[];
    toolCalls: unknown[];
    assistantContent: string;
    firstUsage: LlmUsage;
    model: ResolvedChatModel;
    apiKey: string;
  }): Promise<ChatResponseDto> {
    const assistantMessage = {
      role: 'assistant' as const,
      content: input.assistantContent || null,
      tool_calls: input.toolCalls,
    };

    await this.persistMessage(input.conversationId, {
      role: 'assistant',
      content: input.assistantContent || null,
      toolCalls: input.toolCalls,
    });

    const toolMessages = await this.toolCallingService.executeToolCalls(
      input.toolCalls as any,
    );

    for (const toolMessage of toolMessages) {
      await this.persistMessage(input.conversationId, {
        role: 'tool',
        content: toolMessage.content,
        name: toolMessage.name,
        toolCallId: toolMessage.tool_call_id,
      });
    }

    const followUp = await this.llmChat.complete({
      apiKey: input.apiKey,
      ...this.toLlmModelParams(input.model),
      messages: [
        ...input.previousMessages,
        assistantMessage as LlmMessage,
        ...(toolMessages as unknown as LlmMessage[]),
      ],
    });

    const finalMessage = await this.persistMessage(input.conversationId, {
      role: 'assistant',
      content: followUp.content,
    });

    // รวม usage ของทั้งสองรอบ — โค้ดเดิมทิ้ง usage ของรอบแรกไปทั้งก้อน
    // ทำให้ทุกครั้งที่มีการเรียก tool รายงาน token ต่ำกว่าความจริงหนึ่งคำขอเต็ม ๆ
    const combinedUsage: LlmUsage = {
      promptTokens: input.firstUsage.promptTokens + followUp.usage.promptTokens,
      completionTokens:
        input.firstUsage.completionTokens + followUp.usage.completionTokens,
      totalTokens: input.firstUsage.totalTokens + followUp.usage.totalTokens,
    };

    const tokenUsage = await this.saveTokenUsage(
      input.conversationId,
      finalMessage.id,
      followUp.model,
      combinedUsage,
    );

    return {
      conversationId: input.conversationId,
      messageId: finalMessage.id,
      content: followUp.content,
      role: 'assistant',
      tokenUsage,
      toolCalls: input.toolCalls as any,
      finishReason: followUp.finishReason ?? 'stop',
      createdAt: finalMessage.createdAt,
    };
  }

  /**
   * หาบทสนทนาเดิม หรือสร้างใหม่
   *
   * ตรวจความเป็นเจ้าของด้วยเสมอ — เดิมค้นด้วย id อย่างเดียวโดยไม่เทียบ userId
   * ใครก็ตามที่เดา/รู้ id ของคนอื่นจึงอ่านและต่อบทสนทนาของคนนั้นได้
   *
   * @param input พารามิเตอร์ของรอบสนทนานี้
   * @returns แถว chat_conversation
   * @throws NotFoundException เมื่อไม่พบบทสนทนา
   * @throws ForbiddenException เมื่อไม่ใช่เจ้าของ
   */
  private async resolveConversation(input: ChatTurnInput) {
    if (input.conversationId) {
      const conversation = await this.prisma.chatConversation.findUnique({
        where: { id: input.conversationId },
      });
      if (!conversation) {
        throw new NotFoundException(
          `Conversation ${input.conversationId} not found`,
        );
      }
      if (conversation.userId !== input.userId) {
        throw new ForbiddenException('This conversation belongs to another user');
      }
      return conversation;
    }

    return this.prisma.chatConversation.create({
      data: {
        userId: input.userId,
        organizationId: input.organizationId,
        projectId: input.projectId,
        title: input.message
          ? input.message.substring(0, 80)
          : 'New conversation',
      },
    });
  }

  /**
   * บันทึกข้อความ 1 แถว พร้อมหาเลขลำดับให้
   *
   * @param conversationId บทสนทนาที่สังกัด
   * @param message เนื้อหาที่จะบันทึก
   * @returns แถวที่บันทึกแล้ว
   */
  private async persistMessage(
    conversationId: string,
    message: {
      role: 'user' | 'assistant' | 'tool';
      content: string | null;
      name?: string;
      toolCallId?: string;
      toolCalls?: unknown;
      metadata?: Record<string, unknown>;
    },
  ) {
    const sequence = await this.memoryService.nextSequence(conversationId);
    return this.prisma.chatMessage.create({
      data: {
        conversationId,
        role: message.role,
        content: message.content,
        sequence,
        ...(message.name && { name: message.name }),
        ...(message.toolCallId && { toolCallId: message.toolCallId }),
        ...(message.toolCalls !== undefined && {
          toolCalls: message.toolCalls as any,
        }),
        ...(message.metadata !== undefined && {
          metadata: message.metadata as any,
        }),
      },
    });
  }

  /**
   * จำโมเดลที่ใช้ไว้กับบทสนทนา เพื่อให้รอบถัดไปใช้ตัวเดิมโดยไม่ต้องส่งมาซ้ำ
   *
   * `ChatConversation.model` มีมาแต่แรกแต่ไม่เคยถูกอ่านเลย — การเขียนแล้วอ่านจริง
   * ทำให้ผู้ใช้ที่เลือกโมเดลไว้ไม่ถูกสลับกลับไปโมเดล default เงียบ ๆ ในรอบถัดไป
   *
   * @param conversationId บทสนทนาที่สังกัด
   * @param modelId โมเดลที่เพิ่งใช้
   * @param _userMessageId เผื่ออ้างอิงในอนาคต
   */
  private async rememberModel(
    conversationId: string,
    modelId: string,
    _userMessageId?: string,
  ): Promise<void> {
    await this.prisma.chatConversation
      .update({
        where: { id: conversationId },
        data: { model: modelId },
      })
      .catch((error) => {
        // ไม่ใช่สาระสำคัญของคำขอ — คำตอบส่งไปแล้ว ไม่ควรกลายเป็น error
        this.logger.warn(
          `Failed to remember model for conversation ${conversationId}: ${error?.message}`,
        );
      });
  }

  /**
   * บันทึกจำนวน token ที่ใช้ (เพื่อดูปริมาณเท่านั้น ไม่หักเครดิต)
   *
   * @param conversationId บทสนทนาที่สังกัด
   * @param messageId ข้อความที่ผูกกับการใช้งานนี้
   * @param model โมเดลที่ gateway ใช้จริง
   * @param usage จำนวน token
   * @returns ค่าที่บันทึกไว้
   */
  private async saveTokenUsage(
    conversationId: string,
    messageId: string,
    model: string,
    usage: LlmUsage,
  ): Promise<TokenUsageDto> {
    const totalTokens =
      usage.totalTokens || usage.promptTokens + usage.completionTokens;

    await this.prisma.chatTokenUsage.create({
      data: {
        conversationId,
        messageId,
        model,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens,
      },
    });

    return {
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens,
      model,
    };
  }

  /**
   * ตรวจว่าเป็นสมาชิกขององค์กรที่อ้างถึง
   *
   * ป้องกันไม่ให้คนนอกใช้ key ของ org อื่นยิงโมเดล — เดิมไม่มีการตรวจใด ๆ เลย
   * และ key ที่ใช้ก็เป็นใบกลางใบเดียว ทำให้ใครก็ได้ใช้งบของทั้งระบบ
   *
   * @param organizationId องค์กรที่อ้างถึง
   * @param userId ผู้เรียก
   * @throws ForbiddenException เมื่อไม่ใช่สมาชิก
   */
  private async assertOrgMember(
    organizationId: string,
    userId: string,
  ): Promise<void> {
    const member = await this.orgMemberRepo.findOne({
      where: { organizationId, userId },
    });
    if (!member) {
      throw new ForbiddenException('You are not a member of this organization');
    }
  }
}
