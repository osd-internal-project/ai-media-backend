import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Query,
  Sse,
  UploadedFile,
  UseFilters,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppErrorExceptionFilter } from '@ai-media/share';
import { ChatService } from './chat.service';
import { VisionService } from './services/vision.service';
import { ChatRequestDto, StreamChatQueryDto } from './dto/chat-request.dto';
import { ImagePromptRequestDto } from './dto/image-prompt.dto';
import { Observable } from 'rxjs';

@ApiTags('Chat')
@UseFilters(AppErrorExceptionFilter)
@Controller()
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly visionService: VisionService,
  ) {}

  /**
   * POST /api/chat-assistant/chat
   * Standard (non-streaming) chat completion.
   */
  @Post('chat')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  @ApiOperation({ summary: 'Send a chat message and get a full response' })
  async chat(@Body() dto: ChatRequestDto) {
    return this.chatService.chat(dto);
  }

  /**
   * GET /api/chat-assistant/chat/stream
   * Server-Sent Events streaming chat completion.
   */
  @Sse('chat/stream')
  @ApiOperation({ summary: 'Streaming chat via Server-Sent Events (SSE)' })
  streamChat(@Query() query: StreamChatQueryDto): Observable<MessageEvent> {
    return this.chatService.streamChat({
      userId: query.userId,
      message: query.message,
      conversationId: query.conversationId,
      organizationId: query.organizationId,
      generateType: query.generateType,
      model: query.model,
    });
  }

  /**
   * POST /api/chat-assistant/prompt/from-image
   * Upload a reference image → get a structured AI image generation prompt.
   *
   * Form fields:
   *   - file        (required) image file: jpeg | png | webp | gif, max 10MB
   *   - userId      (optional) to persist result to a conversation
   *   - conversationId (optional) continue existing conversation
   *   - organizationId (optional)
   *   - context     (optional) extra instruction e.g. "แนว minimalist สำหรับ Facebook Ad"
   *   - style       (optional) target style e.g. "cinematic, hyperrealistic"
   *   - model       (optional) override model (must support vision)
   */
  @Post('prompt/from-image')
  @ApiOperation({
    summary: 'Analyze a reference image and generate an AI image prompt',
    description:
      'Upload any reference image. GPT-4o Vision will analyze it and return a structured prompt ready for Midjourney / DALL-E 3 / Stable Diffusion.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary', description: 'Reference image (jpeg/png/webp/gif, max 10MB)' },
        userId: { type: 'string' },
        conversationId: { type: 'string' },
        organizationId: { type: 'string' },
        context: { type: 'string', description: 'Extra instruction for prompt style' },
        style: { type: 'string', description: 'Target art/photo style' },
        model: { type: 'string', description: 'Vision model override (default: gpt-4o)' },
      },
      required: ['file'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
      fileFilter: (_req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (allowed.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new Error(`Unsupported file type: ${file.mimetype}`), false);
        }
      },
    }),
  )
  async generatePromptFromImage(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: ImagePromptRequestDto,
  ) {
    // 400 ไม่ใช่ 500 — ไฟล์ที่หายไปคือคำขอที่ผิด ไม่ใช่ระบบพัง
    if (!file) {
      throw new BadRequestException('No image file provided');
    }
    return this.visionService.generatePromptFromImage(file, dto);
  }
}
