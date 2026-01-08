import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  LogRepository,
  GalleryRepository,
  UsersRepository,
  ErrorLogRepository,
  AuditLogRepository,
} from '@ai-media/share';
import { LogSeverity, AuditAction, Prisma } from '@prisma/client';
import * as dayjs from 'dayjs';
import { MinioClientService } from '../minio-client/minio-client.service';
import { minioConfigs } from 'src/configs';
import { ConfigType } from '@nestjs/config';

@Injectable()
export class LogsService {
  constructor(
    @Inject(minioConfigs.KEY)
    private minioconfig: ConfigType<typeof minioConfigs>,
    private readonly logrepo: LogRepository,
    private readonly galleryRepo: GalleryRepository,
    private readonly userRepo: UsersRepository,
    private readonly minioService: MinioClientService,
  ) {}
  async findProjectImageByPage(
    projectId: string,
    skip?: number,
    take?: number,
  ) {
    const taskIds = await this.galleryRepo.findMany({
      where: {
        projectId: projectId,
        taskId: { not: null },
        typeGenerate: 'image',
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
        typeGenerate: 'image',
      },
      include: { users: true },
      orderBy: { createdAt: 'desc' },
    });

    const logData = await this.logrepo.findMany({
      where: {
        taskId: { in: targetTaskIds },
        typeGenerate: 'image',
      },
      select: {
        taskId: true,
        referenceImages: true,
        resolution: true,
        ratio: true,
      },
    });

    const referenceImagesMap = new Map();
    const resolutionMap = new Map();
    const ratioMap = new Map();

    logData.forEach((log) => {
      if (log.referenceImages && log.referenceImages.length > 0) {
        referenceImagesMap.set(log.taskId, log.referenceImages);
      }
      if (log.resolution) {
        resolutionMap.set(log.taskId, log.resolution);
      }
      if (log.ratio) {
        ratioMap.set(log.taskId, log.ratio);
      }
    });

    const map = new Map();

    for (const item of data) {
      const url = item.imageUrl
        ? await this.minioService.getPresignedUrl(
            item.typeGenerate === 'vdo'
              ? this.minioconfig.minioBucketVdo
              : this.minioconfig.minioBucket,
            item.imageUrl,
          )
        : '';
      const thumbnailUrl = item.thumbnailUrl
        ? await this.minioService.getPresignedUrl(
            item.typeGenerate === 'vdo'
              ? this.minioconfig.minioBucketVdo
              : this.minioconfig.minioBucket,
            item.thumbnailUrl,
          )
        : '';

      // Generate presigned URLs for multiple reference images
      const referenceImageFilenames = referenceImagesMap.get(item.taskId);
      let referenceImageUrls = [];
      if (referenceImageFilenames && referenceImageFilenames.length > 0) {
        for (const filename of referenceImageFilenames) {
          const fileStats = await this.minioService.statFile(
            this.minioconfig.minioBucketUpload,
            filename,
          );
          if (fileStats) {
            const url = await this.minioService.getPresignedUrl(
              this.minioconfig.minioBucketUpload,
              filename,
            );
            referenceImageUrls.push(url);
          } else {
            console.log(`Reference image not found: ${filename}`);
            const placeholder =
              'data:image/svg+xml;base64,' +
              Buffer.from(
                `<svg width="32" height="32" xmlns="http://www.w3.org/2000/svg">
                <rect width="32" height="32" fill="#333"/>
                <text x="16" y="18" text-anchor="middle" font-family="Arial" font-size="8" fill="#666">No Image</text>
              </svg>`,
              ).toString('base64');
            referenceImageUrls.push(placeholder);
          }
        }
      }

      if (!map.has(item.taskId)) {
        map.set(item.taskId, {
          ...item,
          referenceImages: referenceImageUrls, // All reference images
          resolution: resolutionMap.get(item.taskId) || null,
          ratio: ratioMap.get(item.taskId) || null,
          imageUrls: [
            {
              imageUrl: url,
              thumbnailUrl: thumbnailUrl,
            },
          ],
        });
        delete map.get(item.taskId).imageUrl;
        delete map.get(item.taskId).thumbnailUrl;
      } else {
        map.get(item.taskId).imageUrls.push({
          imageUrl: url,
          thumbnailUrl: thumbnailUrl,
        });
      }
    }
    const result = Array.from(map.values());

    return result;
  }
  async findProjectImageByFristId(projectId: string, fristId: string) {
    const cerrentTask = await this.galleryRepo.findOne({
      where: {
        id: fristId,
      },
    });
    const taskIds = await this.galleryRepo.findMany({
      where: {
        projectId: projectId,
        taskId: { not: null },
        typeGenerate: 'image',
        createdAt: { gte: cerrentTask.createdAt },
      },
      select: { taskId: true },
      distinct: ['taskId'],
      orderBy: { createdAt: 'desc' },
    });

    const targetTaskIds = taskIds.map((t) => t.taskId);

    if (targetTaskIds.length === 0) {
      return [];
    }

    const data = await this.galleryRepo.findMany({
      where: {
        taskId: { in: targetTaskIds },
        typeGenerate: 'image',
      },
      include: { users: true },
      orderBy: { createdAt: 'desc' },
    });

    const logData = await this.logrepo.findMany({
      where: {
        taskId: { in: targetTaskIds },
        typeGenerate: 'image',
      },
      select: {
        taskId: true,
        referenceImages: true,
        resolution: true,
        ratio: true,
      },
    });

    const referenceImagesMap = new Map();
    const resolutionMap = new Map();
    const ratioMap = new Map();

    logData.forEach((log) => {
      if (log.referenceImages && log.referenceImages.length > 0) {
        referenceImagesMap.set(log.taskId, log.referenceImages);
      }
      if (log.resolution) {
        resolutionMap.set(log.taskId, log.resolution);
      }
      if (log.ratio) {
        ratioMap.set(log.taskId, log.ratio);
      }
    });

    const map = new Map();

    for (const item of data) {
      const url = item.imageUrl
        ? await this.minioService.getPresignedUrl(
            item.typeGenerate === 'vdo'
              ? this.minioconfig.minioBucketVdo
              : this.minioconfig.minioBucket,
            item.imageUrl,
          )
        : '';
      const thumbnailUrl = item.thumbnailUrl
        ? await this.minioService.getPresignedUrl(
            item.typeGenerate === 'vdo'
              ? this.minioconfig.minioBucketVdo
              : this.minioconfig.minioBucket,
            item.thumbnailUrl,
          )
        : '';

      // Generate presigned URLs for multiple reference images
      const referenceImageFilenames = referenceImagesMap.get(item.taskId);
      let referenceImageUrls = [];
      if (referenceImageFilenames && referenceImageFilenames.length > 0) {
        for (const filename of referenceImageFilenames) {
          const fileStats = await this.minioService.statFile(
            this.minioconfig.minioBucketUpload,
            filename,
          );
          if (fileStats) {
            const url = await this.minioService.getPresignedUrl(
              this.minioconfig.minioBucketUpload,
              filename,
            );
            referenceImageUrls.push(url);
          } else {
            console.log(`Reference image not found: ${filename}`);
            const placeholder =
              'data:image/svg+xml;base64,' +
              Buffer.from(
                `<svg width="32" height="32" xmlns="http://www.w3.org/2000/svg">
                <rect width="32" height="32" fill="#333"/>
                <text x="16" y="18" text-anchor="middle" font-family="Arial" font-size="8" fill="#666">No Image</text>
              </svg>`,
              ).toString('base64');
            referenceImageUrls.push(placeholder);
          }
        }
      }

      if (!map.has(item.taskId)) {
        map.set(item.taskId, {
          ...item,
          referenceImages: referenceImageUrls, // All reference images
          resolution: resolutionMap.get(item.taskId) || null,
          ratio: ratioMap.get(item.taskId) || null,
          imageUrls: [
            {
              imageUrl: url,
              thumbnailUrl: thumbnailUrl,
            },
          ],
        });
        delete map.get(item.taskId).imageUrl;
        delete map.get(item.taskId).thumbnailUrl;
      } else {
        map.get(item.taskId).imageUrls.push({
          imageUrl: url,
          thumbnailUrl: thumbnailUrl,
        });
      }
    }
    const result = Array.from(map.values());

    return result;
  }
  async findProjectViedoByPage(
    projectId: string,
    skip?: number,
    take?: number,
  ) {
    const data = await this.galleryRepo.findMany({
      where: {
        projectId: projectId,
        taskId: { not: null },
        typeGenerate: 'vdo',
      },
      include: { users: true },
      orderBy: { createdAt: 'desc' },
      ...(skip !== undefined && take !== undefined && { skip, take }),
    });

    const targetTaskIds = data.map((t) => t.taskId);

    if (targetTaskIds.length === 0) {
      return [];
    }

    // const data = await this.galleryRepo.findMany({
    //   where: {
    //     taskId: { in: targetTaskIds },
    //     typeGenerate: 'vdo',
    //   },
    //   include: { users: true },
    //   orderBy: { createdAt: 'desc' },
    // });

    const logData = await this.logrepo.findMany({
      where: {
        taskId: { in: targetTaskIds },
        typeGenerate: 'vdo',
      },
      select: {
        taskId: true,
        referenceImages: true,
        resolution: true,
        ratio: true,
      },
    });

    const referenceImagesMap = new Map();
    const resolutionMap = new Map();
    const ratioMap = new Map();

    logData.forEach((log) => {
      if (log.referenceImages && log.referenceImages.length > 0) {
        referenceImagesMap.set(log.taskId, log.referenceImages);
      }
      if (log.resolution) {
        resolutionMap.set(log.taskId, log.resolution);
      }
      if (log.ratio) {
        ratioMap.set(log.taskId, log.ratio);
      }
    });

    const newData = new Map();
    for (const item of data) {
      const url = item.imageUrl
        ? await this.minioService.getPresignedUrl(
            this.minioconfig.minioBucketVdo,
            item.imageUrl,
          )
        : '';
      const thumbnailUrl = item.thumbnailUrl
        ? await this.minioService.getPresignedUrl(
            this.minioconfig.minioBucketVdo,
            item.thumbnailUrl,
          )
        : '';

      // Generate presigned URLs for multiple reference images
      const referenceImageFilenames = referenceImagesMap.get(item.taskId);
      let referenceImageUrls = [];
      if (referenceImageFilenames && referenceImageFilenames.length > 0) {
        for (const filename of referenceImageFilenames) {
          const fileStats = await this.minioService.statFile(
            this.minioconfig.minioBucketUpload,
            filename,
          );
          if (fileStats) {
            const url = await this.minioService.getPresignedUrl(
              this.minioconfig.minioBucketUpload,
              filename,
            );
            referenceImageUrls.push(url);
          } else {
            console.log(`Reference image not found: ${filename}`);
            const placeholder =
              'data:image/svg+xml;base64,' +
              Buffer.from(
                `<svg width="32" height="32" xmlns="http://www.w3.org/2000/svg">
                <rect width="32" height="32" fill="#333"/>
                <text x="16" y="18" text-anchor="middle" font-family="Arial" font-size="8" fill="#666">No Image</text>
              </svg>`,
              ).toString('base64');
            referenceImageUrls.push(placeholder);
          }
        }
      }

      if (!newData.has(item.taskId)) {
        newData.set(item.taskId, {
          ...item,
          referenceImages: referenceImageUrls,
          resolution: resolutionMap.get(item.taskId) || null,
          ratio: ratioMap.get(item.taskId) || null,
          imageUrls: [
            {
              imageUrl: url,
              thumbnailUrl: thumbnailUrl,
            },
          ],
        });
        delete newData.get(item.taskId).imageUrl;
        delete newData.get(item.taskId).thumbnailUrl;
      } else {
        newData.get(item.taskId).imageUrls.push({
          imageUrl: url,
          thumbnailUrl: thumbnailUrl,
        });
      }
    }

    const result = Array.from(newData.values());

    return result;
  }
  async findProjectViedoByFristId(projectId: string, fristId: string) {
    const cerrentTask = await this.galleryRepo.findOne({
      where: {
        id: fristId,
      },
    });
    if (!cerrentTask) {
      return [];
    }
    const data = await this.galleryRepo.findMany({
      where: {
        projectId: projectId,
        taskId: { not: null },
        typeGenerate: 'vdo',
        createdAt: { gte: cerrentTask.createdAt },
      },
      include: { users: true },
      orderBy: { createdAt: 'desc' },
    });

    const targetTaskIds = data.map((t) => t.taskId);

    if (targetTaskIds.length === 0) {
      return [];
    }

    // const data = await this.galleryRepo.findMany({
    //   where: {
    //     taskId: { in: targetTaskIds },
    //     typeGenerate: 'vdo',
    //   },
    //   include: { users: true },
    //   orderBy: { createdAt: 'desc' },
    // });

    const logData = await this.logrepo.findMany({
      where: {
        taskId: { in: targetTaskIds },
        typeGenerate: 'vdo',
      },
      select: {
        taskId: true,
        referenceImages: true,
        resolution: true,
        ratio: true,
      },
    });

    const referenceImagesMap = new Map();
    const resolutionMap = new Map();
    const ratioMap = new Map();

    logData.forEach((log) => {
      if (log.referenceImages && log.referenceImages.length > 0) {
        referenceImagesMap.set(log.taskId, log.referenceImages);
      }
      if (log.resolution) {
        resolutionMap.set(log.taskId, log.resolution);
      }
      if (log.ratio) {
        ratioMap.set(log.taskId, log.ratio);
      }
    });

    const newData = new Map();
    for (const item of data) {
      const url = item.imageUrl
        ? await this.minioService.getPresignedUrl(
            this.minioconfig.minioBucketVdo,
            item.imageUrl,
          )
        : '';
      const thumbnailUrl = item.thumbnailUrl
        ? await this.minioService.getPresignedUrl(
            this.minioconfig.minioBucketVdo,
            item.thumbnailUrl,
          )
        : '';

      // Generate presigned URLs for multiple reference images
      const referenceImageFilenames = referenceImagesMap.get(item.taskId);
      let referenceImageUrls = [];
      if (referenceImageFilenames && referenceImageFilenames.length > 0) {
        for (const filename of referenceImageFilenames) {
          const fileStats = await this.minioService.statFile(
            this.minioconfig.minioBucketUpload,
            filename,
          );
          if (fileStats) {
            const url = await this.minioService.getPresignedUrl(
              this.minioconfig.minioBucketUpload,
              filename,
            );
            referenceImageUrls.push(url);
          } else {
            console.log(`Reference image not found: ${filename}`);
            const placeholder =
              'data:image/svg+xml;base64,' +
              Buffer.from(
                `<svg width="32" height="32" xmlns="http://www.w3.org/2000/svg">
                <rect width="32" height="32" fill="#333"/>
                <text x="16" y="18" text-anchor="middle" font-family="Arial" font-size="8" fill="#666">No Image</text>
              </svg>`,
              ).toString('base64');
            referenceImageUrls.push(placeholder);
          }
        }
      }

      if (!newData.has(item.taskId)) {
        newData.set(item.taskId, {
          ...item,
          referenceImages: referenceImageUrls,
          resolution: resolutionMap.get(item.taskId) || null,
          ratio: ratioMap.get(item.taskId) || null,
          imageUrls: [
            {
              imageUrl: url,
              thumbnailUrl: thumbnailUrl,
            },
          ],
        });
        delete newData.get(item.taskId).imageUrl;
        delete newData.get(item.taskId).thumbnailUrl;
      } else {
        newData.get(item.taskId).imageUrls.push({
          imageUrl: url,
          thumbnailUrl: thumbnailUrl,
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

  async logError(
    serviceName: string,
    severity: LogSeverity,
    message: string,
    stackTrace?: string,
    context?: any,
    userId?: string,
    errorCode?: string,
  ) {
    Logger.error(message, stackTrace, context);
    return this.errorLogRepo.create({
      data: {
        serviceName,
        severity,
        message,
        stackTrace,
        context,
        userId,
        errorCode,
      },
    });
  }

  async logAudit(
    userId: string,
    action: AuditAction,
    entityName: string,
    entityId: string,
    oldValues?: any,
    newValues?: any,
    ipAddress?: string,
    userAgent?: string,
  ) {
    return this.auditLogRepo.create({
      data: {
        userId,
        action,
        entityName,
        entityId,
        oldValues,
        newValues,
        ipAddress,
        userAgent,
      },
    });
  }
}
