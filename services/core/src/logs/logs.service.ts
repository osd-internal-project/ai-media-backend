import { Injectable } from '@nestjs/common';
import {
  LogRepository,
  GalleryRepository,
  UsersRepository,
} from '@ai-media/share';
import * as dayjs from 'dayjs';
import { MinioClientService } from '../minio-client/minio-client.service';
import configs from 'src/configs';
const { minioBucket, minioBucketVdo } = configs();

@Injectable()
export class LogsService {
  constructor(
    private readonly logrepo: LogRepository,
    private readonly galleryRepo: GalleryRepository,
    private readonly userRepo: UsersRepository,
    private readonly minioService: MinioClientService,
  ) { }
  async findOne(projectId: string, skip?: number, take?: number) {
    const startDate = dayjs().subtract(3, 'day').startOf('day').toDate(); // 3 วันก่อน
    const endDate = dayjs().endOf('day').toDate();

    // 1. Fetch paginated Distinct TaskIds
    const taskIds = await this.galleryRepo.findMany({
      where: {
        projectId: projectId,
        taskId: { not: null },
        typeGenerate: 'image',
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: { taskId: true },
      distinct: ['taskId'],
      orderBy: { createdAt: 'desc' },
      ...(skip !== undefined && take !== undefined && { skip, take }),
    });

    const targetTaskIds = taskIds.map((t) => t.taskId);

    if (targetTaskIds.length === 0) {
      return [];
    }

    // 2. Fetch full data (all images) for these TaskIds
    const data = await this.galleryRepo.findMany({
      where: {
        taskId: { in: targetTaskIds },
        typeGenerate: 'image',
      },
      include: { users: true },
      orderBy: { createdAt: 'desc' },
    });

    const map = new Map();
    for (const item of data) {
      const url = item.imageUrl ? await this.minioService.getPresignedUrl(item.typeGenerate === "vdo" ? minioBucketVdo : minioBucket, item.imageUrl) : "";
      const thumbnailUrl = item.thumbnailUrl ? await this.minioService.getPresignedUrl(item.typeGenerate === "vdo" ? minioBucketVdo : minioBucket, item.thumbnailUrl) : "";
      if (!map.has(item.taskId)) {
        map.set(item.taskId, {
          ...item,
          imageUrls: [{
            imageUrl: url,
            thumbnailUrl: thumbnailUrl
          }],
        });
        delete map.get(item.taskId).imageUrl;
        delete map.get(item.taskId).thumbnailUrl;
      } else {
        map.get(item.taskId).imageUrls.push({
          imageUrl: url,
          thumbnailUrl: thumbnailUrl
        });
      }
    }
    const result = Array.from(map.values());
    return result;
  }
  async findOneVDO(projectId: string, skip?: number, take?: number) {
    const startDate = dayjs().subtract(3, 'day').startOf('day').toDate();
    const endDate = dayjs().endOf('day').toDate();
    const taskIds = await this.galleryRepo.findMany({
      where: {
        projectId: projectId,
        taskId: { not: null },
        typeGenerate: 'vdo',
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: { taskId: true },
      distinct: ['taskId'],
      orderBy: { createdAt: 'desc' },
      ...(skip !== undefined && take !== undefined && { skip, take }),
    });

    const targetTaskIds = taskIds.map((t) => t.taskId);

    if (targetTaskIds.length === 0) {
      return [];
    }

    const data = await this.galleryRepo.findMany({
      where: {
        taskId: { in: targetTaskIds },
        typeGenerate: 'vdo',
      },
      include: { users: true },
      orderBy: { createdAt: 'desc' },
    });
    const newData = new Map();
    for (const item of data) {
      const url = item.imageUrl ? await this.minioService.getPresignedUrl(minioBucketVdo, item.imageUrl) : "";
      const thumbnailUrl = item.thumbnailUrl ? await this.minioService.getPresignedUrl(minioBucketVdo, item.thumbnailUrl) : "";
      if (!newData.has(item.taskId)) {
        newData.set(item.taskId, {
          ...item,
          imageUrls: [{
            imageUrl: url,
            thumbnailUrl: thumbnailUrl
          }],
        });
        delete newData.get(item.taskId).imageUrl;
        delete newData.get(item.taskId).thumbnailUrl;
      } else {
        newData.get(item.taskId).imageUrls.push({
          imageUrl: url,
          thumbnailUrl: thumbnailUrl
        });
      }
    }
    const result = Array.from(newData.values());
    return result;
  }
  async findByTaskId(taskId: string, query: any) {
    const data = await this.logrepo.findOne({
      where: {
        taskId,
      },
    });
    const update = await this.logrepo.update({
      where: { id: data.id },
      data: {
        status: query.status,
        tokenUsed: +query.tokenUsed,
      },
    });
    if (update) {
      if (Array.isArray(query.content)) {
        const dataToSave = query.content.map((item: any) => ({
          taskId: data.taskId,
          projectId: data.projectId,
          userId: data.userId,
          imageUrl: item.video_url,
          prompt: data.prompt,
          typeGenerate: 'vdo',
        }));

        await this.galleryRepo.createMany({
          data: dataToSave,
        });
      }
      return data;
    }
  }
  async findByUserId(userId: string, skip: number, take: number) {
    const findUser = await this.userRepo.findOne({ where: { token: userId } });
    const data = await this.logrepo.findMany({
      where: {
        userId: findUser.userId,
        taskId: { not: null },
      },
      ...(skip && take && { skip, take }),
    });
    const count = await this.logrepo.count({
      where: {
        userId: findUser.userId,
        taskId: { not: null },
      },
    });
    return { data, count };
  }
}
