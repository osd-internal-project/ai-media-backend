import { Injectable, Logger } from '@nestjs/common';
import { GalleryRepository } from '@ai-media/share';
import { Prisma } from '@prisma/client';
import { MinioClientService } from 'src/minio-client/minio-client.service';
import configs from 'src/configs';
const { minioBucket, minioBucketVdo } = configs();

@Injectable()
export class GalleryService {
  constructor(
    private readonly galleryRepo: GalleryRepository,
    private readonly minioService: MinioClientService,
  ) {}
  create(createGalleryDto: Prisma.GalleryCreateInput) {
    return this.galleryRepo.create({ data: createGalleryDto });
  }

  findAll() {
    return this.galleryRepo.findAll({});
  }

  async findMany(projectId: string, query: any) {
    const page = +query.page || 1;
    const pageSize = +query.pageSize || 10;
    const data = await this.galleryRepo.findMany({
      where: { projectId: projectId },
      include: { users: true },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    });
    const total = await this.galleryRepo.count({
      where: { projectId: projectId },
    });

    const newData = new Map();
    for (const item of data) {
      const url = item.imageUrl
        ? await this.minioService.getPresignedUrl(
            item.typeGenerate === 'vdo' ? minioBucketVdo : minioBucket,
            item.imageUrl,
          )
        : '';
      const thumbnailUrl = item.thumbnailUrl
        ? await this.minioService.getPresignedUrl(
            item.typeGenerate === 'vdo' ? minioBucketVdo : minioBucket,
            item.thumbnailUrl,
          )
        : '';
      newData.set(item.id, {
        ...item,
        imageUrl: url,
        thumbnailUrl: thumbnailUrl,
      });
    }
    return { data: Array.from(newData.values()), total };
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
      data: { status: !updateGalleryDto.status },
    });
    return data;
  }

  remove(id: string) {
    return this.galleryRepo.delete({ where: { id: id } });
  }
}
