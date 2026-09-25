import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  PhotoEventGenerationRepository,
  PhotoEventPhotoRepository,
  PhotoEventTemplateRepository,
} from '@ai-media/share';
import { PhotoEventGeneration, PhotoEventPhoto } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { GenerateService } from '../generate/services/generate.service';
import { WebsocketGatewayService } from '../websocket/websocket.gateway';
import { CreateGenerationDto } from './dto/create-generation.dto';
import { PhotoEventGenerationView } from './dto/photo-event-view.dto';
import { PhotoEventAccessService } from './photo-event-access.service';
import {
  PHOTO_EVENT_DEFAULT_PROMPT_TAIL,
  PHOTO_EVENT_EVENTS,
  PHOTO_EVENT_MODEL,
  PHOTO_EVENT_ROOM_TYPE,
  PHOTO_EVENT_SIZE,
} from './photo-event.constants';
import { PhotoEventTemplatesService } from './photo-event-templates.service';
import { PhotoEventViewService } from './photo-event-view.service';

/**
 * สร้างงาน generate ผ่าน pipeline เดิม (credit → queue → worker) แบบเดียวกับ Workflow
 * clientId ไม่ใช่ socket จริง เพื่อไม่ให้งานถูก cancel เมื่อจอ kiosk หลุดการเชื่อมต่อ
 */
@Injectable()
export class PhotoEventGenerationsService {
  private readonly logger = new Logger(PhotoEventGenerationsService.name);

  constructor(
    private readonly generationRepo: PhotoEventGenerationRepository,
    private readonly photoRepo: PhotoEventPhotoRepository,
    private readonly templateRepo: PhotoEventTemplateRepository,
    private readonly templatesService: PhotoEventTemplatesService,
    private readonly generateService: GenerateService,
    private readonly gateway: WebsocketGatewayService,
    private readonly access: PhotoEventAccessService,
    private readonly view: PhotoEventViewService,
  ) {}

  async create(
    projectId: string,
    dto: CreateGenerationDto,
  ): Promise<PhotoEventGenerationView> {
    await this.access.findActiveProject(projectId);
    await this.access.ensurePermission(projectId, dto.userId);

    const photo = await this.photoRepo.findOne({
      where: { id: dto.photoId, projectId, status: 'active' },
    });
    if (!photo) throw new NotFoundException(`Photo ${dto.photoId} not found`);

    const template = await this.templateRepo.findOneWithPromptGuide({
      where: { projectId, promptGuideId: dto.promptGuideId },
    });
    if (!template || !template.promptGuide.status) {
      throw new BadRequestException(
        `Template ${dto.promptGuideId} is not enabled for this project`,
      );
    }

    const generation = await this.generationRepo.create({
      data: {
        projectId,
        photoId: photo.id,
        promptGuideId: dto.promptGuideId,
        userId: dto.userId,
        taskId: uuidv4(),
      },
    });
    await this.emitUpdate(generation);

    const templateImagePaths = await this.templatesService.findImagePaths(
      template.promptGuide,
    );
    const prompt = [
      template.promptGuide.textPrompt?.trim(),
      template.promptTail ?? PHOTO_EVENT_DEFAULT_PROMPT_TAIL,
    ]
      .filter(Boolean)
      .join('\n\n');
    const body = this.buildGenerateBody(
      generation,
      photo,
      prompt,
      templateImagePaths,
    );
    return this.dispatch(generation, body);
  }

  async findOne(
    projectId: string,
    generationId: string,
  ): Promise<PhotoEventGenerationView> {
    const generation = await this.generationRepo.findOne({
      where: { id: generationId, projectId },
    });
    if (!generation) {
      throw new NotFoundException(`Generation ${generationId} not found`);
    }
    return this.view.toGenerationView(generation);
  }

  /** ส่ง event ล่าสุดของ generation เข้า room ของ project */
  async emitUpdate(generation: PhotoEventGeneration): Promise<void> {
    this.gateway.emitToRoom(
      `${generation.projectId}:${PHOTO_EVENT_ROOM_TYPE}`,
      PHOTO_EVENT_EVENTS.generationUpdated,
      await this.view.toGenerationView(generation),
    );
  }

  private buildGenerateBody(
    generation: PhotoEventGeneration,
    photo: PhotoEventPhoto,
    prompt: string,
    templateImagePaths: string[],
  ) {
    return {
      taskId: generation.taskId,
      model: PHOTO_EVENT_MODEL,
      prompt,
      // รูปแขกต้องมาก่อน ตามด้วยรูปตัวอย่างของ template
      image: [photo.imagePath, ...templateImagePaths],
      sequentialImageGeneration: 'disabled',
      maxImages: 1,
      watermark: false,
      ...PHOTO_EVENT_SIZE,
      projectId: generation.projectId,
      userId: generation.userId,
      organizationId: photo.organizationId,
      imageGenerateType: 'disabled',
      typeGenerate: 'image',
    };
  }

  private async dispatch(
    generation: PhotoEventGeneration,
    body: Record<string, unknown>,
  ): Promise<PhotoEventGenerationView> {
    try {
      const result = await this.generateService.createImageGenerationTask(
        body,
        `photo-event:${generation.id}`,
      );
      if (!result || result.status !== 200) {
        return this.markFailed(generation, this.stringifyError(result?.data));
      }
      const processing = await this.generationRepo.update({
        where: { id: generation.id },
        data: { status: 'processing' },
      });
      await this.emitUpdate(processing);
      return this.view.toGenerationView(processing);
    } catch (error) {
      this.logger.error(
        `Failed to dispatch generation ${generation.id}: ${this.stringifyError(
          error,
        )}`,
      );
      return this.markFailed(generation, this.stringifyError(error));
    }
  }

  private async markFailed(
    generation: PhotoEventGeneration,
    errorMessage: string,
  ): Promise<PhotoEventGenerationView> {
    const failed = await this.generationRepo.update({
      where: { id: generation.id },
      data: { status: 'failed', errorMessage },
    });
    await this.emitUpdate(failed);
    return this.view.toGenerationView(failed);
  }

  private stringifyError(value: unknown): string {
    if (value instanceof Error) return value.message;
    if (typeof value === 'string') return value;
    if (value == null) return 'Unknown error';
    return JSON.stringify(value);
  }
}
