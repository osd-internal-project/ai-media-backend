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

/** ส่วนที่คนนอกเข้าถึงได้ผ่าน QR — เปิดเฉพาะ generation ที่ success เท่านั้น */
@Injectable()
export class PublicPhotoEventService {
  constructor(
    private readonly generationRepo: PhotoEventGenerationRepository,
    private readonly storageUrl: StorageUrlService,
  ) {}

  async findOne(generationId: string): Promise<PublicPhotoEventView> {
    const { id, outputKey, createdAt } = await this.findSuccess(generationId);
    const imageUrl = await this.storageUrl.toDisplayUrl(outputKey, null);
    if (!imageUrl) {
      throw new InternalServerErrorException('Failed to presign image URL');
    }
    return { id, imageUrl, createdAt };
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
