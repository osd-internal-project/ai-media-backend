import { Inject, Injectable, Logger } from '@nestjs/common';
import { GalleryRepository } from '@ai-media/share';
import { Prisma } from '@prisma/client';
import { MinioClientService } from 'src/minio-client/minio-client.service';
import { ConfigType } from '@nestjs/config';
import { minioConfigs } from 'src/configs';
@Injectable()
export class GalleryService {
  constructor(
    @Inject(minioConfigs.KEY)
    private minioconfigs: ConfigType<typeof minioConfigs>,
    private readonly galleryRepo: GalleryRepository,
    private readonly minioService: MinioClientService,
  ) { }

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
      where: {
        projectId: projectId,
        ...(query?.status && { status: true }),
      },
      include: { users: true },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    });
    const total = await this.galleryRepo.count({
      where: { projectId: projectId, ...(query?.status && { status: true }) },
    });

    const newData = new Map();
    for (const item of data) {
      const url = item.imageUrl
        ? await this.minioService.getPresignedUrl(
          item.typeGenerate === 'video'
            ? this.minioconfigs.minioBucketVdo
            : this.minioconfigs.minioBucket,
          item.imageUrl,
        )
        : '';
      const thumbnailUrl = item.thumbnailUrl
        ? await this.minioService.getPresignedUrl(
          item.typeGenerate === 'video'
            ? this.minioconfigs.minioBucketVdo
            : this.minioconfigs.minioBucket,
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
      data: { status: updateGalleryDto.status },
    });
    return data;
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
