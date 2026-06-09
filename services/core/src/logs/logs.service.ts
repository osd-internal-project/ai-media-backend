import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  LogRepository,
  GalleryRepository,
  UsersRepository,
  ErrorLogRepository,
  AuditLogRepository,
  TosService,
  ProjectMemberRepository,
} from '@ai-media/share';
import { LogSeverity, AuditAction, Prisma } from '@prisma/client';
import { tosConfigs } from 'src/configs';
import * as dayjs from 'dayjs';

const REF_IMAGE_PLACEHOLDER =
  'data:image/svg+xml;base64,' +
  Buffer.from(
    `<svg width="32" height="32" xmlns="http://www.w3.org/2000/svg">
    <rect width="32" height="32" fill="#333"/>
    <text x="16" y="18" text-anchor="middle" font-family="Arial" font-size="8" fill="#666">No Image</text>
  </svg>`,
  ).toString('base64');

@Injectable()
export class LogsService {
  constructor(
    private readonly logrepo: LogRepository,
    private readonly galleryRepo: GalleryRepository,
    private readonly userRepo: UsersRepository,
    private readonly auditLogRepo: AuditLogRepository,
    private readonly errorLogRepo: ErrorLogRepository,
    private readonly tosService: TosService,
    private readonly projectMemberRepository: ProjectMemberRepository,
  ) {}

  async findProjectImageByPage(
    projectId: string,
    organizationId: string,
    userId: string,
    skip?: number,
    take?: number,
    fristsql?: number,
    lastsql?: number,
  ) {
    const user = userId
      ? await this.userRepo.findOne({
          where: { token: userId },
        })
      : null;
    const tasks = await this.logrepo.findMany({
      where: {
        status: { not: 'failed' },
        projectId: projectId,
        taskId: { not: null },
        typeGenerate: 'image',
        ...(fristsql && { seq: { lt: fristsql } }),
        ...(lastsql && { seq: { gt: lastsql } }),
        ...(user && { userId: user.userId }),
      },
      distinct: ['taskId'],
      orderBy: { createdAt: 'desc' },
      ...(skip !== undefined && take !== undefined && { skip, take }),
    });

    const targetTaskIds = tasks.map((t) => t.taskId);

    if (targetTaskIds.length === 0) {
      return [];
    }

    const data = await this.galleryRepo.findMany({
      where: {
        taskId: { in: targetTaskIds },
        typeGenerate: 'image',
        genneratedStatus: { not: 'FAILED' },
      },
      include: { users: true },
      orderBy: { createdAt: 'desc' },
    });

    // const logData = await this.logrepo.findMany({
    //   where: {
    //     taskId: { in: targetTaskIds },
    //     typeGenerate: 'image',
    //   },
    // });

    const referenceImagesMap = new Map();
    const resolutionMap = new Map();
    const ratioMap = new Map();
    const seqMap = new Map();

    tasks.forEach((log) => {
      if (log.referenceImages && log.referenceImages.length > 0) {
        referenceImagesMap.set(log.taskId, log.referenceImages);
      }
      if (log.resolution) {
        resolutionMap.set(log.taskId, log.resolution);
      }
      if (log.seq) {
        seqMap.set(log.taskId, log.seq);
      }
    });
    const bucket = tosConfigs().tosBucket;
    const PLACEHOLDER = REF_IMAGE_PLACEHOLDER;

    const processed = await Promise.all(
      data.map(async (item) => {
        const base = `organize/${organizationId}/${item.projectId}/${item.typeGenerate}-generate`;
        const [url, thumbnailUrl] = await Promise.all([
          item.imageUrl
            ? this.tosService.getPreSignedUrl(
                bucket,
                `${base}/${item.imageUrl}`,
              )
            : Promise.resolve(''),
          item.thumbnailUrl
            ? this.tosService.getPreSignedUrl(
                bucket,
                `${base}/${item.thumbnailUrl}`,
              )
            : Promise.resolve(''),
        ]);
        const filenames: string[] = referenceImagesMap.get(item.taskId) || [];
        const referenceImageUrls = await Promise.all(
          filenames.map(async (filename) => {
            const ok = await this.tosService.headObject(bucket, filename);
            return ok
              ? this.tosService.getPreSignedUrl(bucket, filename)
              : PLACEHOLDER;
          }),
        );
        return { item, url, thumbnailUrl, referenceImageUrls };
      }),
    );

    const map = new Map();
    for (const { item, url, thumbnailUrl, referenceImageUrls } of processed) {
      if (!map.has(item.taskId)) {
        map.set(item.taskId, {
          ...item,
          referenceImages: referenceImageUrls,
          resolution: resolutionMap.get(item.taskId) || null,
          ratio: ratioMap.get(item.taskId) || null,
          seq: seqMap.get(item.taskId) || null,
          imageUrls: [
            {
              imageUrl: url,
              thumbnailUrl,
              id: item.id,
              status: item.status,
              fileName: item.imageUrl,
            },
          ],
        });
        delete map.get(item.taskId).imageUrl;
        delete map.get(item.taskId).thumbnailUrl;
      } else {
        map.get(item.taskId).imageUrls.push({
          imageUrl: url,
          thumbnailUrl,
          id: item.id,
          status: item.status,
          fileName: item.imageUrl,
          seq: seqMap.get(item.taskId) || null,
        });
      }
    }
    return Array.from(map.values());
  }
  async findProjectVideoByPage(
    projectId: string,
    organizationId: string,
    userId: string,
    skip?: number,
    take?: number,
    fristseq?: number,
    lastseq?: number,
  ) {
    const user = userId
      ? await this.userRepo.findOne({
          where: { token: userId },
        })
      : null;
    const tasks = await this.logrepo.findMany({
      where: {
        status: { not: 'failed' },
        projectId: projectId,
        taskId: { not: null },
        typeGenerate: 'video',
        ...(fristseq && { seq: { lt: fristseq } }),
        ...(lastseq && { seq: { gt: lastseq } }),
        ...(userId && { userId: userId }),
        ...(user && { userId: user.userId }),
      },
      distinct: ['taskId'],

      // include: { users: true },
      // distinct: ['taskId'],
      orderBy: { createdAt: 'desc' },
      ...(skip !== undefined && take !== undefined && { skip, take }),
    });
    const targetTaskIds = tasks.map((t) => t.taskId);

    if (targetTaskIds.length === 0) {
      return [];
    }

    const data = await this.galleryRepo.findMany({
      where: {
        taskId: { in: targetTaskIds },
        typeGenerate: 'video',
        genneratedStatus: { not: 'FAILED' },
      },
      include: { users: true },
      orderBy: { createdAt: 'desc' },
    });

    // const logData = await this.logrepo.findMany({
    //   where: {
    //     taskId: { in: targetTaskIds },
    //     typeGenerate: 'video',
    //   },
    //   select: {
    //     taskId: true,
    //     referenceImages: true,
    //     resolution: true,
    //     ratio: true,
    //     generateAudio: true,
    //   },
    // });

    const referenceImagesMap = new Map();
    const resolutionMap = new Map();
    const ratioMap = new Map();
    const generateAudio = new Map();
    const seqMap = new Map();
    tasks.forEach((log) => {
      if (log.referenceImages && log.referenceImages.length > 0) {
        referenceImagesMap.set(log.taskId, log.referenceImages);
      }
      if (log.resolution) {
        resolutionMap.set(log.taskId, log.resolution);
      }
      if (log.ratio) {
        ratioMap.set(log.taskId, log.ratio);
      }
      if (log.generateAudio) {
        generateAudio.set(log.taskId, log.generateAudio);
      }
      if (log.seq) {
        seqMap.set(log.taskId, log.seq);
      }
    });

    const bucket = tosConfigs().tosBucket;
    const PLACEHOLDER = REF_IMAGE_PLACEHOLDER;

    const processed = await Promise.all(
      data.map(async (item) => {
        const base = `organize/${organizationId}/${item.projectId}/${item.typeGenerate}-generate`;
        const [url, thumbnailUrl] = await Promise.all([
          item.imageUrl
            ? this.tosService.getPreSignedUrl(
                bucket,
                `${base}/${item.imageUrl}`,
              )
            : Promise.resolve(''),
          item.thumbnailUrl
            ? this.tosService.getPreSignedUrl(
                bucket,
                `${base}/${item.thumbnailUrl}`,
              )
            : Promise.resolve(''),
        ]);
        const filenames: string[] = referenceImagesMap.get(item.taskId) || [];
        const refBase = `organize/${organizationId}/${item.projectId}/uploads`;
        const referenceImageUrls = await Promise.all(
          filenames.map(async (filename) => {
            const path = `${refBase}/${filename}`;
            const ok = await this.tosService.headObject(bucket, path);
            return ok
              ? this.tosService.getPreSignedUrl(bucket, path)
              : PLACEHOLDER;
          }),
        );
        return { item, url, thumbnailUrl, referenceImageUrls };
      }),
    );

    const newData = new Map();
    for (const { item, url, thumbnailUrl, referenceImageUrls } of processed) {
      if (!newData.has(item.taskId)) {
        newData.set(item.taskId, {
          ...item,
          referenceImages: referenceImageUrls,
          resolution: resolutionMap.get(item.taskId) || null,
          ratio: ratioMap.get(item.taskId) || null,
          generateAudio: generateAudio.get(item.taskId) || null,
          seq: seqMap.get(item.taskId) || null,
          imageUrls: [
            {
              imageUrl: url,
              thumbnailUrl,
              id: item.id,
              status: item.status,
              fileName: item.imageUrl,
            },
          ],
        });
        delete newData.get(item.taskId).imageUrl;
        delete newData.get(item.taskId).thumbnailUrl;
      } else {
        newData.get(item.taskId).imageUrls.push({
          imageUrl: url,
          thumbnailUrl,
          id: item.id,
          fileName: item.imageUrl,
          status: item.status,
        });
      }
    }
    return Array.from(newData.values());
  }

  async findProjectOmniHumenByPage(
    projectId: string,
    organizationId: string,
    userId: string,
    skip?: number,
    take?: number,
    fristseq?: number,
    lastseq?: number,
  ) {
    const user = userId
      ? await this.userRepo.findOne({
          where: { token: userId },
        })
      : null;
    const tasks = await this.logrepo.findMany({
      where: {
        status: { not: 'failed' },
        projectId: projectId,
        taskId: { not: null },
        typeGenerate: 'omnihumen',
        ...(fristseq && { seq: { lt: fristseq } }),
        ...(lastseq && { seq: { gt: lastseq } }),
        ...(userId && { userId: userId }),
        ...(user && { userId: user.userId }),
      },
      distinct: ['taskId'],
      orderBy: { createdAt: 'desc' },
      ...(skip !== undefined && take !== undefined && { skip, take }),
    });
    const targetTaskIds = tasks.map((t) => t.taskId);

    if (targetTaskIds.length === 0) {
      return [];
    }

    const data = await this.galleryRepo.findMany({
      where: {
        genneratedStatus: { not: 'FAILED' },
        taskId: { in: targetTaskIds },
        typeGenerate: 'omnihumen',
      },
      include: { users: true },
      orderBy: { createdAt: 'desc' },
    });

    // const logData = await this.logrepo.findMany({
    //   where: {
    //     taskId: { in: targetTaskIds },
    //     typeGenerate: 'omnihumen',
    //   },
    //   select: {
    //     taskId: true,
    //     referenceImages: true,
    //     resolution: true,
    //     ratio: true,
    //     generateAudio: true,
    //     seq: true,
    //   },
    // });
    const referenceImagesMap = new Map();
    const resolutionMap = new Map();
    const ratioMap = new Map();
    const generateAudio = new Map();
    const seqMap = new Map();
    tasks.forEach((log) => {
      if (log.referenceImages && log.referenceImages.length > 0) {
        referenceImagesMap.set(log.taskId, log.referenceImages);
      }
      if (log.resolution) {
        resolutionMap.set(log.taskId, log.resolution);
      }
      if (log.ratio) {
        ratioMap.set(log.taskId, log.ratio);
      }
      if (log.generateAudio) {
        generateAudio.set(log.taskId, log.generateAudio);
      }
      if (log.seq) {
        seqMap.set(log.taskId, log.seq);
      }
    });
    const bucket = tosConfigs().tosBucket;
    const processed = await Promise.all(
      data.map(async (item) => {
        const base = `organize/${organizationId}/${item.projectId}/${item.typeGenerate}-generate`;
        const [url, thumbnailUrl] = await Promise.all([
          item.imageUrl
            ? this.tosService.getPreSignedUrl(
                bucket,
                `${base}/${item.imageUrl}`,
              )
            : Promise.resolve(''),
          item.thumbnailUrl
            ? this.tosService.getPreSignedUrl(
                bucket,
                `${base}/${item.thumbnailUrl}`,
              )
            : Promise.resolve(''),
        ]);
        const filenames: string[] = referenceImagesMap.get(item.taskId) || [];
        const referenceImageUrls = await Promise.all(
          filenames.map(async (filename) => {
            const ok = await this.tosService.headObject(bucket, filename || '');
            return ok
              ? this.tosService.getPreSignedUrl(bucket, filename)
              : REF_IMAGE_PLACEHOLDER;
          }),
        );
        return { item, url, thumbnailUrl, referenceImageUrls };
      }),
    );

    const newData = new Map();
    for (const { item, url, thumbnailUrl, referenceImageUrls } of processed) {
      if (!newData.has(item.taskId)) {
        newData.set(item.taskId, {
          ...item,
          referenceImages: referenceImageUrls,
          resolution: resolutionMap.get(item.taskId) || null,
          ratio: ratioMap.get(item.taskId) || null,
          generateAudio: generateAudio.get(item.taskId) || null,
          seq: seqMap.get(item.taskId) || null,
          imageUrls: [
            {
              imageUrl: url,
              thumbnailUrl,
              id: item.id,
              status: item.status,
              fileName: item.imageUrl,
            },
          ],
        });
        delete newData.get(item.taskId).imageUrl;
        delete newData.get(item.taskId).thumbnailUrl;
      } else {
        newData.get(item.taskId).imageUrls.push({
          imageUrl: url,
          thumbnailUrl,
          id: item.id,
          fileName: item.imageUrl,
          status: item.status,
        });
      }
    }
    return Array.from(newData.values());
  }

  async findProjectDreamactorByPage(
    projectId: string,
    organizationId: string,
    userId: string,
    skip?: number,
    take?: number,
    fristseq?: number,
    lastseq?: number,
  ) {
    const user = userId
      ? await this.userRepo.findOne({
          where: { token: userId },
        })
      : null;
    const tasks = await this.logrepo.findMany({
      where: {
        status: { not: 'failed' },
        projectId: projectId,
        taskId: { not: null },
        typeGenerate: 'dreamactor',
        ...(fristseq && { seq: { lt: fristseq } }),
        ...(lastseq && { seq: { gt: lastseq } }),
        ...(userId && { userId: userId }),
        ...(user && { userId: user.userId }),
      },
      distinct: ['taskId'],
      include: { users: true },
      orderBy: { createdAt: 'desc' },
      ...(skip !== undefined && take !== undefined && { skip, take }),
    });
    const targetTaskIds = tasks.map((t) => t.taskId);

    if (targetTaskIds.length === 0) {
      return [];
    }

    const data = await this.galleryRepo.findMany({
      where: {
        taskId: { in: targetTaskIds },
        typeGenerate: 'dreamactor',
        genneratedStatus: { not: 'FAILED' },
      },
      include: { users: true },
      orderBy: { createdAt: 'desc' },
    });

    // const logData = await this.logrepo.findMany({
    //   where: {
    //     taskId: { in: targetTaskIds },
    //     typeGenerate: 'dreamactor',
    //   },
    //   select: {
    //     taskId: true,
    //     referenceImages: true,
    //     resolution: true,
    //     ratio: true,
    //     generateAudio: true,
    //     seq: true,
    //   },
    // });

    const referenceImagesMap = new Map();
    const resolutionMap = new Map();
    const ratioMap = new Map();
    const generateAudio = new Map();
    const seqMap = new Map();
    tasks.forEach((log) => {
      if (log.referenceImages && log.referenceImages.length > 0) {
        referenceImagesMap.set(log.taskId, log.referenceImages);
      }
      if (log.resolution) {
        resolutionMap.set(log.taskId, log.resolution);
      }
      if (log.ratio) {
        ratioMap.set(log.taskId, log.ratio);
      }
      if (log.generateAudio) {
        generateAudio.set(log.taskId, log.generateAudio);
      }
      if (log.seq) {
        seqMap.set(log.taskId, log.seq);
      }
    });
    const bucket = tosConfigs().tosBucket;
    const processed = await Promise.all(
      data.map(async (item) => {
        const base = `organize/${organizationId}/${item.projectId}/${item.typeGenerate}-generate`;
        const [url, thumbnailUrl] = await Promise.all([
          item.imageUrl
            ? this.tosService.getPreSignedUrl(
                bucket,
                `${base}/${item.imageUrl}`,
              )
            : Promise.resolve(''),
          item.thumbnailUrl
            ? this.tosService.getPreSignedUrl(
                bucket,
                `${base}/${item.thumbnailUrl}`,
              )
            : Promise.resolve(''),
        ]);
        const filenames: string[] = referenceImagesMap.get(item.taskId) || [];
        const referenceImageUrls = await Promise.all(
          filenames.map(async (filename) => {
            const ok = await this.tosService.headObject(bucket, filename || '');
            return ok
              ? this.tosService.getPreSignedUrl(bucket, filename)
              : REF_IMAGE_PLACEHOLDER;
          }),
        );
        return { item, url, thumbnailUrl, referenceImageUrls };
      }),
    );

    const newData = new Map();
    for (const { item, url, thumbnailUrl, referenceImageUrls } of processed) {
      if (!newData.has(item.taskId)) {
        newData.set(item.taskId, {
          ...item,
          referenceImages: referenceImageUrls,
          resolution: resolutionMap.get(item.taskId) || null,
          ratio: ratioMap.get(item.taskId) || null,
          generateAudio: generateAudio.get(item.taskId) || null,
          seq: seqMap.get(item.taskId) || null,

          imageUrls: [
            {
              imageUrl: url,
              thumbnailUrl: thumbnailUrl,
              id: item.id,
              status: item.status,
              fileName: item.imageUrl,
            },
          ],
        });
        delete newData.get(item.taskId).imageUrl;
        delete newData.get(item.taskId).thumbnailUrl;
      } else {
        newData.get(item.taskId).imageUrls.push({
          imageUrl: url,
          thumbnailUrl: thumbnailUrl,
          id: item.id,
          fileName: item.imageUrl,
          status: item.status,
        });
      }
    }

    const result = Array.from(newData.values());

    return result;
  }

  async findProjectViedoByFristId(
    projectId: string,
    organizationId: string,
    fristId: string,
  ) {
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
        genneratedStatus: { not: 'FAILED' },
        projectId: projectId,
        taskId: { not: null },
        typeGenerate: 'video',
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
    //     typeGenerate: 'video',
    //   },
    //   include: { users: true },
    //   orderBy: { createdAt: 'desc' },
    // });

    const logData = await this.logrepo.findMany({
      where: {
        taskId: { in: targetTaskIds },
        typeGenerate: 'video',
        status: { not: 'failed' },
      },
      select: {
        taskId: true,
        referenceImages: true,
        resolution: true,
        ratio: true,
        generateAudio: true,
        seq: true,
      },
    });

    const referenceImagesMap = new Map();
    const resolutionMap = new Map();
    const ratioMap = new Map();
    const generateAudio = new Map();

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
      if (log.generateAudio) {
        generateAudio.set(log.taskId, log.generateAudio);
      }
    });

    const bucket = tosConfigs().tosBucket;
    const processed = await Promise.all(
      data.map(async (item) => {
        const base = `organize/${organizationId}/${item.projectId}/${item.typeGenerate}-generate`;
        const [url, thumbnailUrl] = await Promise.all([
          item.imageUrl
            ? this.tosService.getPreSignedUrl(
                bucket,
                `${base}/${item.imageUrl}`,
              )
            : Promise.resolve(''),
          item.thumbnailUrl
            ? this.tosService.getPreSignedUrl(
                bucket,
                `${base}/${item.thumbnailUrl}`,
              )
            : Promise.resolve(''),
        ]);
        const filenames: string[] = referenceImagesMap.get(item.taskId) || [];
        const refBase = `organize/${organizationId}/${item.projectId}/uploads`;
        const referenceImageUrls = await Promise.all(
          filenames.map(async (filename) => {
            const path = `${refBase}/${filename}`;
            const ok = await this.tosService.headObject(bucket, path);
            return ok
              ? this.tosService.getPreSignedUrl(bucket, path)
              : REF_IMAGE_PLACEHOLDER;
          }),
        );
        return { item, url, thumbnailUrl, referenceImageUrls };
      }),
    );

    const newData = new Map();
    for (const { item, url, thumbnailUrl, referenceImageUrls } of processed) {
      if (!newData.has(item.taskId)) {
        newData.set(item.taskId, {
          ...item,
          referenceImages: referenceImageUrls,
          resolution: resolutionMap.get(item.taskId) || null,
          ratio: ratioMap.get(item.taskId) || null,
          generateAudio: generateAudio.get(item.taskId) || false,
          imageUrls: [
            {
              imageUrl: url,
              thumbnailUrl,
              id: item.id,
              fileName: item.imageUrl,
              status: item.status,
            },
          ],
        });
        delete newData.get(item.taskId).imageUrl;
        delete newData.get(item.taskId).thumbnailUrl;
      } else {
        newData.get(item.taskId).imageUrls.push({
          imageUrl: url,
          thumbnailUrl,
          id: item.id,
          status: item.status,
          fileName: item.imageUrl,
        });
      }
    }
    return Array.from(newData.values());
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
          typeGenerate: 'video',
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
  async findUsedCredit(
    projectId: string,
    organizationId: string,
    token: string,
    type: 'image' | 'video' | 'omnihumen' | 'dreamactor',
  ): Promise<{ usedCredit?: number; totalCredit?: number }> {
    const findUser = await this.userRepo.findOne({ where: { token: token } });
    const projectMember = await this.projectMemberRepository.findOne({
      where: {
        projectId: projectId,
        userId: findUser.userId,
      },
    });
    // const currentCredit =
    //   type === 'image'
    //     ? projectMember.holdImageAllowance + projectMember.usedImageAllowance ||
    //       0
    //     : projectMember.holdCreditAllowance +
    //         projectMember.usedCreditAllowance || 0;
    // const totalCredit =
    //   type === 'image'
    //     ? projectMember.limitImageAllowance || 0
    //     : projectMember.limitCreditAllowance || 0;

    const currentCredit =
      projectMember.holdCreditAllowance + projectMember.usedCreditAllowance ||
      0;
    const totalCredit = projectMember.limitCreditAllowance || 0;

    return {
      usedCredit: currentCredit,
      totalCredit,
    };
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
