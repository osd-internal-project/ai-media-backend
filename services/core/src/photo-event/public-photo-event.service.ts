import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  PhotoEventGenerationRepository,
  StorageUrlService,
} from '@ai-media/share';
import { PublicPhotoEventView } from './dto/photo-event-view.dto';
import { PhotoEventPrintService } from './photo-event-print.service';

/** ส่วนที่คนนอกเข้าถึงได้ผ่าน QR — เปิดเฉพาะ generation ที่ success เท่านั้น */
@Injectable()
export class PublicPhotoEventService {
  constructor(
    private readonly generationRepo: PhotoEventGenerationRepository,
    private readonly storageUrl: StorageUrlService,
    private readonly printService: PhotoEventPrintService,
  ) {}

  async findOne(generationId: string): Promise<PublicPhotoEventView> {
    const { id, projectId, outputKey, createdAt } = await this.findSuccess(
      generationId,
    );
    const [imageUrl, template] = await Promise.all([
      this.storageUrl.toDisplayUrl(outputKey, null),
      this.printService.findActive(projectId),
    ]);
    if (!imageUrl) {
      throw new InternalServerErrorException('Failed to presign image URL');
    }
    // ส่งเฉพาะ layout + asset — ชื่อ/id ของ template เป็นข้อมูลภายใน
    const printDesign = template
      ? { layout: template.layout, assetUrls: template.assetUrls }
      : null;
    return { id, imageUrl, createdAt, printDesign };
  }

  async resolveDownloadUrl(generationId: string): Promise<string> {
    const { id, outputKey } = await this.findSuccess(generationId);
    const url = await this.storageUrl.toDownloadUrl(outputKey, {
      contentType: 'image/jpeg',
      contentDisposition: `attachment; filename="photo-${id.slice(0, 8)}.jpg"`,
    });
    if (!url) {
      throw new InternalServerErrorException('Failed to presign download URL');
    }
    return url;
  }

  private async findSuccess(generationId: string) {
    const generation = await this.generationRepo.findOne({
      where: { id: generationId, status: 'success', outputKey: { not: null } },
    });
    if (!generation?.outputKey) {
      throw new NotFoundException('Photo not found');
    }
    return { ...generation, outputKey: generation.outputKey };
  }
}
