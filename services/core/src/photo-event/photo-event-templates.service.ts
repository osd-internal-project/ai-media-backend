import { BadRequestException, Injectable } from '@nestjs/common';
import {
  PhotoEventTemplateRepository,
  PrismaTransactionService,
  PromptGuideImageRepository,
  PromptGuideRepository,
  StorageUrlService,
} from '@ai-media/share';
import { PromptGuide } from '@prisma/client';
import { PhotoEventTemplateView } from './dto/photo-event-view.dto';
import { PHOTO_EVENT_DEFAULT_PROMPT_TAIL } from './photo-event.constants';
import { SetTemplatesDto } from './dto/set-templates.dto';
import { PhotoEventAccessService } from './photo-event-access.service';

/** template ของ Photo Event = PromptGuide (image) ของ org ที่ project เลือกไว้ */
@Injectable()
export class PhotoEventTemplatesService {
  constructor(
    private readonly templateRepo: PhotoEventTemplateRepository,
    private readonly promptGuideRepo: PromptGuideRepository,
    private readonly promptGuideImageRepo: PromptGuideImageRepository,
    private readonly storageUrl: StorageUrlService,
    private readonly transaction: PrismaTransactionService,
    private readonly access: PhotoEventAccessService,
  ) {}

  async findByProject(projectId: string): Promise<PhotoEventTemplateView[]> {
    const links = await this.templateRepo.findManyWithPromptGuide({
      where: { projectId, promptGuide: { status: true } },
      orderBy: { sortOrder: 'asc' },
    });
    return Promise.all(
      links.map(async (link) => ({
        promptGuideId: link.promptGuideId,
        title: link.promptGuide.title ?? '',
        description: link.promptGuide.description,
        textPrompt: link.promptGuide.textPrompt ?? '',
        promptTail: link.promptTail,
        defaultPromptTail: PHOTO_EVENT_DEFAULT_PROMPT_TAIL,
        imageUrls: await this.resolveImageUrls(link.promptGuide),
        sortOrder: link.sortOrder,
      })),
    );
  }

  async setTemplates(
    projectId: string,
    dto: SetTemplatesDto,
  ): Promise<PhotoEventTemplateView[]> {
    const project = await this.access.findActiveProject(projectId);
    await this.access.ensurePermission(projectId, dto.userId, 'ADMIN');

    const uniqueIds = [...new Set(dto.templates.map((t) => t.promptGuideId))];
    const tailById = new Map(
      dto.templates.map((t) => [
        t.promptGuideId,
        this.normalizeTail(t.promptTail),
      ]),
    );
    const guides = await this.promptGuideRepo.findMany({
      where: {
        id: { in: uniqueIds },
        organizationId: project.organizationId,
        generateType: 'image',
      },
    });
    if (guides.length !== uniqueIds.length) {
      throw new BadRequestException(
        'Some templates do not exist or are not image templates of this organization',
      );
    }

    await this.transaction.execute(async (prisma) => {
      await this.templateRepo.deleteMany({ where: { projectId } }, { prisma });
      await this.templateRepo.createMany(
        {
          data: uniqueIds.map((promptGuideId, sortOrder) => ({
            projectId,
            promptGuideId,
            sortOrder,
            promptTail: tailById.get(promptGuideId) ?? null,
          })),
        },
        { prisma },
      );
    });
    return this.findByProject(projectId);
  }

  /** storage key ของรูป template เรียงตาม index — ใช้เป็น reference image ตอน generate */
  async findImagePaths(guide: PromptGuide): Promise<string[]> {
    if (guide.promptGuideImages.length === 0) return [];
    const images = await this.promptGuideImageRepo.findMany({
      where: { uid: { in: guide.promptGuideImages }, status: 'completed' },
      orderBy: { index: 'asc' },
    });
    return images.map((image) => image.imagePath);
  }

  /** ค่าว่างหรือเท่ากับ default ถือว่าใช้ default — ถ้า default เปลี่ยนภายหลัง template จะได้ค่าใหม่ตาม */
  private normalizeTail(tail: string | null | undefined): string | null {
    const trimmed = tail?.trim();
    if (!trimmed || trimmed === PHOTO_EVENT_DEFAULT_PROMPT_TAIL) return null;
    return trimmed;
  }

  private async resolveImageUrls(guide: PromptGuide): Promise<string[]> {
    const paths = await this.findImagePaths(guide);
    const urls = await Promise.all(
      paths.map((path) => this.storageUrl.toDisplayUrl(path)),
    );
    return urls.filter((url): url is string => Boolean(url));
  }
}
