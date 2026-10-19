import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  GalleryRepository,
  StorageUrlService,
  buildOutputKey,
  resolveGalleryResultUrls,
} from '@ai-media/share';
import { Prisma } from '@prisma/client';

const AUDIO_CONTENT_TYPES: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
};

export const downloadContentType = (
  typeGenerate: string | null,
  objectName: string,
): string => {
  if (typeGenerate === 'video') return 'video/mp4';
  if (typeGenerate === 'audio') {
    const ext = objectName.split('.').pop()?.toLowerCase() ?? '';
    return AUDIO_CONTENT_TYPES[ext] ?? 'application/octet-stream';
  }
  return 'image/jpeg';
};

@Injectable()
export class GalleryService {
  constructor(
    private readonly galleryRepo: GalleryRepository,
    private readonly storageUrl: StorageUrlService,
  ) {}

  create(createGalleryDto: Prisma.GalleryCreateInput) {
    return this.galleryRepo.create({ data: createGalleryDto });
  }

  findAll() {
    return this.galleryRepo.findAll({});
  }

  async findMany(projectId: string, query: any) {
    const organizationId = query.organizationId;
    const page = +query.page || 1;
    const pageSize = +query.pageSize || 10;
    const where = {
      projectId: projectId,
      ...(query?.status && { status: true }),
      // All Activity hides failed generations; NULL is kept because `not` alone would drop it.
      ...(query?.hideFailed === 'true' && {
        OR: [
          { genneratedStatus: null },
          { genneratedStatus: { not: 'FAILED' } },
        ],
      }),
    };
    const data = await this.galleryRepo.findMany({
      where,
      include: { users: true },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    });
    const total = await this.galleryRepo.count({ where });

    const processedData = await Promise.all(
      data.map(async (item) => {
        // ใช้ resultUrl[] เป็นหลัก, fallback ไป imageUrl เดี่ยวสำหรับ data เก่า
        const objectNames = resolveGalleryResultUrls(item);
        const resolve = (name: string | null) =>
          this.storageUrl
            .resolveOutputUrl(
              organizationId,
              item.projectId,
              item.typeGenerate,
              name,
            )
            .then((url) => url ?? '');
        const [resultUrl, thumbnailUrl] = await Promise.all([
          Promise.all(objectNames.map(resolve)),
          resolve(item.thumbnailUrl),
        ]);
        // คง imageUrl เป็น presigned ของรูปแรกไว้ เพื่อไม่ให้ consumer เดิมพัง
        return {
          ...item,
          resultUrl,
          imageUrl: resultUrl[0] ?? '',
          thumbnailUrl,
        };
      }),
    );
    return { data: processedData, total };
  }

  async findByActivity(projectId: string, query: any) {
    const page = +query.page || 1;
    const pageSize = +query.pageSize || 10;
    const data = await this.galleryRepo.findMany({
      where: { projectId: projectId, status: true },
      include: { users: true },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    });
    const total = await this.galleryRepo.count({
      where: { projectId: projectId, status: true },
    });
    return { data, total };
  }

  async update(taskId: string, updateGalleryDto: Prisma.GalleryUpdateInput) {
    const found = await this.galleryRepo.findOne({
      where: {
        taskId,
        // imageUrl: updateGalleryDto.imageUrl as string,
      },
    });
    Logger.debug(!updateGalleryDto.status);
    const data = await this.galleryRepo.update({
      where: {
        id: found.id,
      },
      data: { status: updateGalleryDto.status },
    });
    return data;
  }
  async downloadFile(id: string, query: any) {
    const organizationId = query.organizationId;

    const found = await this.galleryRepo.findOne({
      where: {
        id,
      },
    });
    if (!found) {
      throw new NotFoundException(`Gallery item ${id} not found`);
    }

    // ใช้รูปแรกจาก resultUrl[] (fallback imageUrl สำหรับ data เก่า)
    const objectName = resolveGalleryResultUrls(found)[0] ?? '';
    if (!objectName) {
      throw new NotFoundException(
        `Gallery item ${id} has no downloadable file`,
      );
    }

    const type = downloadContentType(found.typeGenerate, objectName);
    const downloadName = query.filename || objectName;
    const key = buildOutputKey(
      organizationId || '',
      found.projectId,
      found.typeGenerate,
      objectName,
    );

    // Presign a direct-download URL so the file streams from TOS to the client
    // instead of being buffered through this pod (avoids the egress spike and
    // the OOM-driven 500s of proxying whole media files).
    const url = await this.storageUrl.toDownloadUrl(key, {
      contentType: type,
      contentDisposition: `attachment; filename="${downloadName}"`,
    });
    if (!url) {
      throw new InternalServerErrorException('Failed to presign download URL');
    }

    return { url };
  }
  async updateById(id: string, updateGalleryDto: Prisma.GalleryUpdateInput) {
    const data = await this.galleryRepo.update({
      where: {
        id: id,
      },
      data: { status: updateGalleryDto.status },
    });
    return data;
  }
  remove(id: string) {
    return this.galleryRepo.delete({ where: { id: id } });
  }
}
