import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  GalleryRepository,
  TosService,
  resolveGalleryResultUrls,
} from '@ai-media/share';
import { Prisma } from '@prisma/client';
import { tosConfigs } from 'src/configs';

@Injectable()
export class GalleryService {
  constructor(
    private readonly galleryRepo: GalleryRepository,
    private readonly tosService: TosService,
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

    const bucket = tosConfigs().tosBucket;
    const processedData = await Promise.all(
      data.map(async (item) => {
        const basePath = `organize/${organizationId}/${item.projectId}/${item.typeGenerate}-generate`;
        // ใช้ resultUrl[] เป็นหลัก, fallback ไป imageUrl เดี่ยวสำหรับ data เก่า
        const objectNames = resolveGalleryResultUrls(item);
        const [resultUrl, thumbnailUrl] = await Promise.all([
          Promise.all(
            objectNames.map((name) =>
              this.tosService.getPreSignedUrl(bucket, `${basePath}/${name}`),
            ),
          ),
          item.thumbnailUrl
            ? this.tosService.getPreSignedUrl(bucket, `${basePath}/${item.thumbnailUrl}`)
            : Promise.resolve(''),
        ]);
        // คง imageUrl เป็น presigned ของรูปแรกไว้ เพื่อไม่ให้ consumer เดิมพัง
        return { ...item, resultUrl, imageUrl: resultUrl[0] ?? '', thumbnailUrl };
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
    // ใช้รูปแรกจาก resultUrl[] (fallback imageUrl สำหรับ data เก่า)
    const objectName = resolveGalleryResultUrls(found)[0] ?? '';
    const file = await this.tosService.getObjectV2(
      tosConfigs().tosBucket,
      `organize/${organizationId || ''}/${found.projectId}/${
        `${found.typeGenerate}-generate`
      }/${objectName}`,
    );
    console.log(`download : ${objectName}`);
    return {
      file,
      name: objectName,
      type: found.typeGenerate === 'video' ? 'video/mp4' : 'image/jpeg',
    };
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
