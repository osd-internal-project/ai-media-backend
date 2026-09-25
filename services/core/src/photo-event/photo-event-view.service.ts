import { Injectable } from '@nestjs/common';
import { PromptGuideRepository, StorageUrlService } from '@ai-media/share';
import { PhotoEventGeneration, PhotoEventPhoto } from '@prisma/client';
import {
  PhotoEventGenerationView,
  PhotoEventPhotoView,
} from './dto/photo-event-view.dto';
import { PhotoEventGenerationStatus } from './photo-event.constants';

/** แปลงแถว DB เป็น payload ที่ส่งให้ frontend — presign URL ทุกครั้งที่อ่าน */
@Injectable()
export class PhotoEventViewService {
  constructor(
    private readonly storageUrl: StorageUrlService,
    private readonly promptGuideRepo: PromptGuideRepository,
  ) {}

  async toPhotoViews(
    photos: (PhotoEventPhoto & { generations: PhotoEventGeneration[] })[],
  ): Promise<PhotoEventPhotoView[]> {
    const titles = await this.findTemplateTitles(
      photos.flatMap((photo) => photo.generations),
    );
    return Promise.all(
      photos.map(async (photo) => ({
        ...(await this.toPhotoBase(photo)),
        generations: await Promise.all(
          photo.generations.map((generation) =>
            this.toGenerationView(generation, titles),
          ),
        ),
      })),
    );
  }

  async toPhotoBase(
    photo: PhotoEventPhoto,
  ): Promise<Omit<PhotoEventPhotoView, 'generations'>> {
    return {
      id: photo.id,
      projectId: photo.projectId,
      imageName: photo.imageName,
      url: await this.storageUrl.toDisplayUrl(photo.imagePath),
      createdAt: photo.createdAt,
    };
  }

  async toGenerationView(
    generation: PhotoEventGeneration,
    titles?: Map<number, string>,
  ): Promise<PhotoEventGenerationView> {
    const titleMap = titles ?? (await this.findTemplateTitles([generation]));
    return {
      id: generation.id,
      photoId: generation.photoId,
      promptGuideId: generation.promptGuideId,
      templateTitle: titleMap.get(generation.promptGuideId) ?? null,
      // status ถูกเขียนโดย service นี้เท่านั้น จึงอยู่ใน union เสมอ
      status: generation.status as PhotoEventGenerationStatus,
      progress: generation.progress,
      resultUrl: await this.storageUrl.toDisplayUrl(generation.outputKey, null),
      errorMessage: generation.errorMessage,
      createdAt: generation.createdAt,
    };
  }

  private async findTemplateTitles(
    generations: PhotoEventGeneration[],
  ): Promise<Map<number, string>> {
    const ids = [...new Set(generations.map((g) => g.promptGuideId))];
    if (ids.length === 0) return new Map();
    const guides = await this.promptGuideRepo.findMany({
      where: { id: { in: ids } },
      select: { id: true, title: true },
    });
    return new Map(guides.map((guide) => [guide.id, guide.title ?? '']));
  }
}
