import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  LlmChatService,
  LlmGatewayService,
  LlmMessage,
  PrismaService,
} from '@ai-media/share';
import { MemoryService } from './memory.service';
import { ChatModelService } from './chat-model.service';
import {
  ImagePromptRequestDto,
  ImagePromptResponseDto,
} from '../dto/image-prompt.dto';

/** เพดาน token ของคำตอบ — คำตอบเป็น JSON ก้อนเดียว ไม่ต้องยาว */
const VISION_MAX_TOKENS = 1024;

const VISION_SYSTEM_PROMPT = `You are an expert Creative Prompt Engineer specialized in Digital Marketing and AI Image Generation.

Your ONLY task is to analyze a reference image and produce a high-quality, structured image generation prompt for tools like Midjourney, DALL-E 3, or Stable Diffusion.

## Output Format (STRICT JSON — no markdown, no extra text):
{
  "analysis": "<1-2 sentences describing what you observe in the image>",
  "breakdown": {
    "subject": "<main subject>",
    "action": "<what the subject is doing>",
    "environment": "<background/scene>",
    "lighting": "<lighting style>",
    "cameraAngle": "<camera/composition angle>",
    "style": "<art style / photography style>",
    "colorPalette": "<dominant colors>"
  },
  "prompt": "<Full English image generation prompt with comma-separated keywords, highly detailed>",
  "negativePrompt": "<things to avoid e.g. blurry, low quality, watermark, text>",
  "aspectRatio": "<e.g. 16:9 | 9:16 | 1:1 | 4:3>"
}

Rules:
- The "prompt" field MUST be in English.
- Use descriptive adjectives and photography/art terminology.
- Keep "prompt" concise but rich with detail (50-120 words ideal).
- If the user provides a context/instruction, incorporate it into the prompt style.
- Return ONLY valid JSON, nothing else.`;

@Injectable()
export class VisionService {
  private readonly logger = new Logger(VisionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly memoryService: MemoryService,
    private readonly chatModelService: ChatModelService,
    private readonly llmChat: LlmChatService,
    private readonly llmGateway: LlmGatewayService,
  ) {}

  /**
   * วิเคราะห์รูปอ้างอิงแล้วคืน prompt สำหรับ generate ภาพ
   *
   * ใช้ทางเดียวกับแชทปกติ (gateway + key ของ org) ต่างที่ส่ง content เป็น array
   * ที่มีทั้งรูปและข้อความ ตามสัญญาของ OpenAI-compatible API
   *
   * @param file รูปที่อัปโหลดมา
   * @param dto บริบทเพิ่มเติมและปลายทางที่จะบันทึกผล
   * @returns prompt ที่แตกโครงสร้างแล้ว
   * @throws BadRequestException เมื่อไฟล์ไม่รองรับ โมเดลไม่รองรับรูป หรือคำตอบไม่ใช่ JSON
   */
  async generatePromptFromImage(
    file: Express.Multer.File,
    dto: ImagePromptRequestDto,
  ): Promise<ImagePromptResponseDto> {
    const allowedMimeTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
    ];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported file type: ${file.mimetype}. Allowed: jpeg, png, webp, gif`,
      );
    }

    if (!dto.organizationId) {
      throw new BadRequestException(
        'organizationId is required — it selects the LLM gateway key',
      );
    }

    const model = await this.chatModelService.resolve(dto.model);
    if (!model.supportsVision) {
      throw new BadRequestException(
        `Model "${model.modelId}" cannot read images. Pick a vision-capable model.`,
      );
    }

    const apiKey = await this.llmGateway.getOrCreateApiKey(dto.organizationId);
    if (!apiKey) {
      throw new BadRequestException(
        'No LLM gateway key is available for this organization',
      );
    }

    const dataUrl = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
    const userText = this.buildUserText(dto.context, dto.style);

    const messages: LlmMessage[] = [
      { role: 'system', content: VISION_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
          { type: 'text', text: userText },
        ],
      },
    ];

    this.logger.debug(
      `Vision call: model=${model.modelId}, file=${file.originalname} (${Math.round(
        file.size / 1024,
      )}KB)`,
    );

    let result: Awaited<ReturnType<LlmChatService['complete']>>;
    try {
      result = await this.llmChat.complete({
        apiKey,
        model: model.modelId,
        messages,
        maxTokens: VISION_MAX_TOKENS,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.error(`Vision LLM call failed: ${detail}`);
      throw new BadRequestException(`AI vision service unavailable: ${detail}`);
    }

    const parsed = this.parseJsonResponse(result.content);

    const tokenUsage = {
      promptTokens: result.usage.promptTokens,
      completionTokens: result.usage.completionTokens,
      totalTokens: result.usage.totalTokens,
      model: result.model,
    };

    const persisted = await this.persistResult({
      dto,
      file,
      userText,
      parsed,
      rawContent: result.content,
      model: result.model,
      tokenUsage,
    });

    return {
      analysis: parsed.analysis ?? '',
      breakdown: parsed.breakdown ?? {
        subject: '',
        action: '',
        environment: '',
        lighting: '',
        cameraAngle: '',
        style: '',
        colorPalette: '',
      },
      prompt: parsed.prompt ?? '',
      negativePrompt:
        parsed.negativePrompt ?? 'blurry, low quality, watermark, text, logo',
      aspectRatio: parsed.aspectRatio ?? '16:9',
      tokenUsage,
      conversationId: persisted.conversationId,
      messageId: persisted.messageId,
    };
  }

  /**
   * แกะ JSON จากคำตอบของโมเดล
   *
   * บางโมเดลห่อ JSON ไว้ใน code fence แม้จะสั่งห้ามไว้แล้ว — ลอกออกก่อน parse
   * แทนที่จะโยน error ใส่ผู้ใช้ทั้งที่คำตอบใช้ได้
   *
   * @param content คำตอบดิบ
   * @returns object ที่ parse แล้ว
   * @throws BadRequestException เมื่อ parse ไม่ได้จริง ๆ
   */
  private parseJsonResponse(content: string): Record<string, any> {
    const cleaned = content
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '');

    try {
      return JSON.parse(cleaned || '{}');
    } catch {
      this.logger.error(`Failed to parse vision response JSON: ${content}`);
      throw new BadRequestException(
        'AI returned unexpected format. Please try again.',
      );
    }
  }

  /**
   * บันทึกผลลงบทสนทนา (ไม่บังคับ)
   *
   * ล้มเหลวแล้วไม่โยนต่อ — ผู้ใช้ได้ prompt ไปแล้ว การบันทึกไม่สำเร็จไม่ควรทำให้
   * คำขอที่สำเร็จกลายเป็น error หมายเหตุ: เมื่อบันทึกไม่สำเร็จ conversationId
   * ที่คืนไปจะชี้ไปยังบทสนทนาที่ไม่มีข้อความอยู่ข้างใน
   *
   * @returns id ของบทสนทนาและข้อความที่บันทึกได้ (ถ้าบันทึกได้)
   */
  private async persistResult(input: {
    dto: ImagePromptRequestDto;
    file: Express.Multer.File;
    userText: string;
    parsed: Record<string, any>;
    rawContent: string;
    model: string;
    tokenUsage: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  }): Promise<{ conversationId?: string; messageId?: string }> {
    const { dto, file, userText, parsed, rawContent, model, tokenUsage } = input;
    if (!dto.userId) return { conversationId: dto.conversationId };

    let conversationId = dto.conversationId;
    try {
      if (!conversationId) {
        const conversation = await this.prisma.chatConversation.create({
          data: {
            userId: dto.userId,
            organizationId: dto.organizationId,
            title: `Image Prompt: ${file.originalname}`,
          },
        });
        conversationId = conversation.id;
      }

      const userSeq = await this.memoryService.nextSequence(conversationId);
      await this.prisma.chatMessage.create({
        data: {
          conversationId,
          role: 'user',
          content: `[Image uploaded: ${file.originalname}]\n${userText}`,
          sequence: userSeq,
        },
      });

      const assistantSeq = await this.memoryService.nextSequence(conversationId);
      const savedMessage = await this.prisma.chatMessage.create({
        data: {
          conversationId,
          role: 'assistant',
          content: parsed.prompt ?? rawContent,
          sequence: assistantSeq,
          metadata: {
            type: 'image_prompt',
            negativePrompt: parsed.negativePrompt,
            aspectRatio: parsed.aspectRatio,
            breakdown: parsed.breakdown,
          },
        },
      });

      await this.prisma.chatTokenUsage.create({
        data: {
          conversationId,
          messageId: savedMessage.id,
          model,
          promptTokens: tokenUsage.promptTokens,
          completionTokens: tokenUsage.completionTokens,
          totalTokens: tokenUsage.totalTokens,
        },
      });

      return { conversationId, messageId: savedMessage.id };
    } catch (error) {
      this.logger.warn(
        `Failed to persist vision result (non-blocking): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { conversationId };
    }
  }

  /**
   * ประกอบข้อความที่ส่งไปพร้อมรูป
   *
   * @param context บริบทเพิ่มเติมจากผู้ใช้
   * @param style สไตล์เป้าหมาย
   * @returns ข้อความที่จะแนบไปกับรูป
   */
  private buildUserText(context?: string, style?: string): string {
    const parts = ['Please analyze this image and generate an AI image prompt.'];
    if (context) parts.push(`Additional context: ${context}`);
    if (style) parts.push(`Target style: ${style}`);
    return parts.join('\n');
  }
}
