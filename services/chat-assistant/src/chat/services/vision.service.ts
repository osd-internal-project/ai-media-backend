import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '@ai-media/share';
import { firstValueFrom } from 'rxjs';
import { AxiosRequestConfig } from 'axios';
import { RetryService } from './retry.service';
import { MemoryService } from './memory.service';
import config from '../../configs';
import {
  ImagePromptRequestDto,
  ImagePromptResponseDto,
} from '../dto/image-prompt.dto';

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
  private readonly cfg = config().openai;

  constructor(
    private readonly httpService: HttpService,
    private readonly prisma: PrismaService,
    private readonly retryService: RetryService,
    private readonly memoryService: MemoryService,
  ) {}

  /**
   * Analyze an uploaded image buffer and return a structured AI image generation prompt.
   */
  async generatePromptFromImage(
    file: Express.Multer.File,
    dto: ImagePromptRequestDto,
  ): Promise<ImagePromptResponseDto> {
    // 1. Validate file type
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported file type: ${file.mimetype}. Allowed: jpeg, png, webp, gif`,
      );
    }

    // 2. Encode image to base64 data URL
    const base64Image = file.buffer.toString('base64');
    const dataUrl = `data:${file.mimetype};base64,${base64Image}`;

    // 3. Build vision messages
    const userText = this.buildUserText(dto.context, dto.style);
    const model = dto.model ?? this.cfg.model;

    const messages = [
      {
        role: 'system',
        content: VISION_SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: dataUrl,
              detail: 'high',
            },
          },
          {
            type: 'text',
            text: userText,
          },
        ],
      },
    ];

    this.logger.debug(
      `Vision call: model=${model}, file=${file.originalname} (${Math.round(file.size / 1024)}KB)`,
    );

    // 4. Call LLM with vision
    let llmData: any;
    let usedModel = model;

    try {
      const result = await this.retryService.callWithRetry({
        baseUrl: this.cfg.baseUrl,
        apiKey: this.cfg.apiKey,
        model,
        fallbackModel: this.cfg.fallbackModel,
        maxRetries: this.cfg.maxRetries,
        timeoutMs: this.cfg.timeoutMs,
        payload: {
          messages,
          max_tokens: 1024,
          response_format: { type: 'json_object' },
        },
      });
      llmData = result.data;
      usedModel = result.usedModel;
    } catch (err: any) {
      this.logger.error(`Vision LLM call failed: ${err.message}`);
      throw new BadRequestException(`AI vision service unavailable: ${err.message}`);
    }

    // 5. Parse structured JSON response
    const rawContent: string = llmData.choices?.[0]?.message?.content ?? '{}';
    let parsed: any;

    try {
      parsed = JSON.parse(rawContent);
    } catch {
      this.logger.error(`Failed to parse vision response JSON: ${rawContent}`);
      throw new BadRequestException('AI returned unexpected format. Please try again.');
    }

    const tokenUsage = {
      promptTokens: llmData.usage?.prompt_tokens ?? 0,
      completionTokens: llmData.usage?.completion_tokens ?? 0,
      totalTokens: llmData.usage?.total_tokens ?? 0,
      model: usedModel,
    };

    // 6. Optionally persist to conversation
    let conversationId: string | undefined = dto.conversationId;
    let messageId: string | undefined;

    if (dto.userId) {
      try {
        // Create or reuse conversation
        if (!conversationId) {
          const conv = await this.prisma.chatConversation.create({
            data: {
              userId: dto.userId,
              organizationId: dto.organizationId,
              title: `Image Prompt: ${file.originalname}`,
            },
          });
          conversationId = conv.id;
        }

        // Save user turn (image reference note)
        const userSeq = await this.memoryService.nextSequence(conversationId);
        await this.prisma.chatMessage.create({
          data: {
            conversationId,
            role: 'user',
            content: `[Image uploaded: ${file.originalname}]\n${userText}`,
            sequence: userSeq,
          },
        });

        // Save assistant turn (the generated prompt)
        const assistantSeq = await this.memoryService.nextSequence(conversationId);
        const savedMsg = await this.prisma.chatMessage.create({
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
        messageId = savedMsg.id;

        // Save token usage
        await this.prisma.chatTokenUsage.create({
          data: {
            conversationId,
            messageId,
            model: usedModel,
            promptTokens: tokenUsage.promptTokens,
            completionTokens: tokenUsage.completionTokens,
            totalTokens: tokenUsage.totalTokens,
          },
        });
      } catch (dbErr: any) {
        this.logger.warn(`Failed to persist vision result to DB (non-blocking): ${dbErr.message}`);
      }
    }

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
      negativePrompt: parsed.negativePrompt ?? 'blurry, low quality, watermark, text, logo',
      aspectRatio: parsed.aspectRatio ?? '16:9',
      tokenUsage,
      conversationId,
      messageId,
    };
  }

  private buildUserText(context?: string, style?: string): string {
    const parts: string[] = ['Please analyze this image and generate an AI image prompt.'];
    if (context) parts.push(`Additional context: ${context}`);
    if (style) parts.push(`Target style: ${style}`);
    return parts.join('\n');
  }
}
