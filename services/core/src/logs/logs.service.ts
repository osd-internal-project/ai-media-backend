import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  LogRepository,
  GalleryRepository,
  UsersRepository,
  ErrorLogRepository,
  AuditLogRepository,
  ProjectMemberRepository,
  resolveGalleryResultUrls,
  StorageUrlService,
  toGenerationTypeKey,
} from '@ai-media/share';
import { LogSeverity, AuditAction, Prisma } from '@prisma/client';
import * as dayjs from 'dayjs';

@Injectable()
export class LogsService {
  constructor(
    private readonly logrepo: LogRepository,
    private readonly galleryRepo: GalleryRepository,
    private readonly userRepo: UsersRepository,
    private readonly auditLogRepo: AuditLogRepository,
    private readonly errorLogRepo: ErrorLogRepository,
    private readonly storageUrl: StorageUrlService,
    private readonly projectMemberRepository: ProjectMemberRepository,
  ) {}

  /**
   * แปลงชื่อไฟล์ผลลัพธ์ของ gallery row เป็น URL สำหรับแสดงผล
   *
   * @param organizationId รหัสองค์กรของผู้เรียก
   * @param item gallery row ที่มี projectId และ typeGenerate
   * @param objectName ชื่อไฟล์ใน bucket (ว่างได้)
   * @returns URL สำหรับแสดงผล หรือ '' เมื่อไม่มีไฟล์ (คง shape เดิมที่ client คาดหวัง)
   */
  private async resolveOutputUrl(
    organizationId: string,
    item: { projectId: string; typeGenerate: string },
    objectName: string | null | undefined,
  ): Promise<string> {
    const url = await this.storageUrl.resolveOutputUrl(
      organizationId,
      item.projectId,
      item.typeGenerate,
      objectName,
    );
    return url ?? '';
  }

  /**
   * แปลง reference image ที่เก็บไว้เป็น object key ให้เป็น URL สำหรับแสดงผล
   *
   * ค่าใน referenceImages เป็น key เต็ม (organize/.../upload/xxx.png) อยู่แล้ว
   * จึงส่งเข้า resolver ตรง ๆ ห้ามเติม prefix ทับ
   *
   * @param referenceImagesMap map จาก taskId → list ของ reference key
   * @param taskId taskId ของ gallery row
   * @returns list ของ URL (ไฟล์ที่หาไม่เจอกลายเป็น placeholder)
   */
  private resolveReferenceImageUrls(
    referenceImagesMap: Map<string, string[]>,
    taskId: string,
  ): Promise<string[]> {
    const filenames: string[] = referenceImagesMap.get(taskId) ?? [];
    return this.storageUrl.toVerifiedDisplayUrls(filenames);
  }

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
    // อ่าน metadata จาก gallery โดยตรง (denormalize แล้ว) — เลิก join log
    const tasks = await this.galleryRepo.findMany({
      where: {
        genneratedStatus: { not: 'FAILED' },
        projectId: projectId,
        taskId: { not: null },
        typeGenerate: 'image',
        ...(fristsql && { seq: { lt: fristsql } }),
        ...(lastsql && { seq: { gt: lastsql } }),
        ...(user && { userId: user.userId }),
      },
      distinct: ['taskId'],
      orderBy: { seq: 'desc' }, // ต้องตรงกับ cursor fristsql/lastsql
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
    const processed = await Promise.all(
      data.map(async (item) => {
        // ใช้ resultUrl[] เป็นหลัก, fallback imageUrl เดี่ยวสำหรับ data เก่า
        const objectNames = resolveGalleryResultUrls(item);
        const [urls, thumbnailUrl] = await Promise.all([
          Promise.all(
            objectNames.map((name) =>
              this.resolveOutputUrl(organizationId, item, name),
            ),
          ),
          this.resolveOutputUrl(organizationId, item, item.thumbnailUrl),
        ]);
        // 1 entry ต่อ 1 รูปใน resultUrl[] (data เก่า = 1 entry จาก imageUrl)
        const entries = urls.map((imageUrl, i) => ({
          imageUrl,
          thumbnailUrl,
          id: item.id,
          status: item.status,
          fileName: objectNames[i],
        }));
        const referenceImageUrls = await this.resolveReferenceImageUrls(
          referenceImagesMap,
          item.taskId,
        );
        return { item, entries, referenceImageUrls };
      }),
    );

    const map = new Map();
    for (const { item, entries, referenceImageUrls } of processed) {
      if (!map.has(item.taskId)) {
        map.set(item.taskId, {
          ...item,
          referenceImages: referenceImageUrls,
          resolution: resolutionMap.get(item.taskId) || null,
          ratio: ratioMap.get(item.taskId) || null,
          seq: seqMap.get(item.taskId) || null,
          imageUrls: [...entries],
        });
        delete map.get(item.taskId).imageUrl;
        delete map.get(item.taskId).thumbnailUrl;
      } else {
        map.get(item.taskId).imageUrls.push(...entries);
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
    // อ่าน metadata จาก gallery โดยตรง (denormalize แล้ว) — เลิก join log
    const tasks = await this.galleryRepo.findMany({
      where: {
        genneratedStatus: { not: 'FAILED' },
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
      orderBy: { seq: 'desc' },
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

    const processed = await Promise.all(
      data.map(async (item) => {
        // ใช้ resultUrl[] เป็นหลัก, fallback imageUrl เดี่ยวสำหรับ data เก่า
        const objectNames = resolveGalleryResultUrls(item);
        const [urls, thumbnailUrl] = await Promise.all([
          Promise.all(
            objectNames.map((name) =>
              this.resolveOutputUrl(organizationId, item, name),
            ),
          ),
          this.resolveOutputUrl(organizationId, item, item.thumbnailUrl),
        ]);
        // 1 entry ต่อ 1 ไฟล์ใน resultUrl[] (data เก่า = 1 entry จาก imageUrl)
        const entries = urls.map((imageUrl, i) => ({
          imageUrl,
          thumbnailUrl,
          id: item.id,
          status: item.status,
          fileName: objectNames[i],
        }));
        const referenceImageUrls = await this.resolveReferenceImageUrls(
          referenceImagesMap,
          item.taskId,
        );
        return { item, entries, referenceImageUrls };
      }),
    );

    const newData = new Map();
    for (const { item, entries, referenceImageUrls } of processed) {
      if (!newData.has(item.taskId)) {
        newData.set(item.taskId, {
          ...item,
          referenceImages: referenceImageUrls,
          resolution: resolutionMap.get(item.taskId) || null,
          ratio: ratioMap.get(item.taskId) || null,
          generateAudio: generateAudio.get(item.taskId) || null,
          seq: seqMap.get(item.taskId) || null,
          imageUrls: [...entries],
        });
        delete newData.get(item.taskId).imageUrl;
        delete newData.get(item.taskId).thumbnailUrl;
      } else {
        newData.get(item.taskId).imageUrls.push(...entries);
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
    // อ่าน metadata จาก gallery โดยตรง (denormalize แล้ว) — เลิก join log
    const tasks = await this.galleryRepo.findMany({
      where: {
        genneratedStatus: { not: 'FAILED' },
        projectId: projectId,
        taskId: { not: null },
        typeGenerate: 'omnihumen',
        ...(fristseq && { seq: { lt: fristseq } }),
        ...(lastseq && { seq: { gt: lastseq } }),
        ...(userId && { userId: userId }),
        ...(user && { userId: user.userId }),
      },
      distinct: ['taskId'],
      orderBy: { seq: 'desc' },
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
    const processed = await Promise.all(
      data.map(async (item) => {
        const [url, thumbnailUrl] = await Promise.all([
          this.resolveOutputUrl(organizationId, item, item.imageUrl),
          this.resolveOutputUrl(organizationId, item, item.thumbnailUrl),
        ]);
        const referenceImageUrls = await this.resolveReferenceImageUrls(
          referenceImagesMap,
          item.taskId,
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
    return this.findProjectGalleryByPage(
      'dreamactor',
      projectId,
      organizationId,
      userId,
      skip,
      take,
      fristseq,
      lastseq,
    );
  }

  async findProjectAudioByPage(
    projectId: string,
    organizationId: string,
    userId: string,
    skip?: number,
    take?: number,
    fristseq?: number,
    lastseq?: number,
  ) {
    return this.findProjectGalleryByPage(
      'audio',
      projectId,
      organizationId,
      userId,
      skip,
      take,
      fristseq,
      lastseq,
    );
  }

  /** history จาก gallery ล้วน (ไม่ join log) — ใช้ร่วมกันระหว่าง type ที่ shape เหมือนกัน */
  private async findProjectGalleryByPage(
    typeGenerate: 'dreamactor' | 'audio',
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
    // อ่าน metadata จาก gallery โดยตรง (denormalize แล้ว) — เลิก join log
    const tasks = await this.galleryRepo.findMany({
      where: {
        genneratedStatus: { not: 'FAILED' },
        projectId: projectId,
        taskId: { not: null },
        typeGenerate,
        ...(fristseq && { seq: { lt: fristseq } }),
        ...(lastseq && { seq: { gt: lastseq } }),
        ...(userId && { userId: userId }),
        ...(user && { userId: user.userId }),
      },
      distinct: ['taskId'],
      include: { users: true },
      orderBy: { seq: 'desc' },
      ...(skip !== undefined && take !== undefined && { skip, take }),
    });
    const targetTaskIds = tasks.map((t) => t.taskId);

    if (targetTaskIds.length === 0) {
      return [];
    }

    const data = await this.galleryRepo.findMany({
      where: {
        taskId: { in: targetTaskIds },
        typeGenerate,
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
    const processed = await Promise.all(
      data.map(async (item) => {
        const [url, thumbnailUrl] = await Promise.all([
          this.resolveOutputUrl(organizationId, item, item.imageUrl),
          this.resolveOutputUrl(organizationId, item, item.thumbnailUrl),
        ]);
        const referenceImageUrls = await this.resolveReferenceImageUrls(
          referenceImagesMap,
          item.taskId,
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

    // อ่าน metadata จาก gallery โดยตรง (denormalize แล้ว) — เลิก join log
    const logData = await this.galleryRepo.findMany({
      where: {
        taskId: { in: targetTaskIds },
        typeGenerate: 'video',
        genneratedStatus: { not: 'FAILED' },
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

    const processed = await Promise.all(
      data.map(async (item) => {
        const [url, thumbnailUrl] = await Promise.all([
          this.resolveOutputUrl(organizationId, item, item.imageUrl),
          this.resolveOutputUrl(organizationId, item, item.thumbnailUrl),
        ]);
        const referenceImageUrls = await this.resolveReferenceImageUrls(
          referenceImagesMap,
          item.taskId,
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
    type: 'image' | 'video' | 'omnihumen' | 'dreamactor' | 'audio',
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

  /**
   * One generation with presigned media, for the dashboard log drawer.
   * The organization is part of the lookup, so a log from another org reads as not found.
   */
  async findDetail(logId: string, organizationId: string) {
    if (!organizationId) {
      throw new NotFoundException(`Log ${logId} not found`);
    }
    const log = await this.logrepo.findOne({
      where: { id: logId, project: { organizationId } },
      include: {
        project: { select: { id: true, name: true } },
        users: { select: { userId: true, fullname: true, username: true } },
      },
    });
    if (!log) {
      throw new NotFoundException(`Log ${logId} not found`);
    }

    const gallery = log.galleryId
      ? await this.galleryRepo.findOne({ where: { id: log.galleryId } })
      : log.taskId
        ? await this.galleryRepo.findOne({ where: { taskId: log.taskId } })
        : null;

    const typeGenerate = gallery?.typeGenerate ?? log.typeGenerate ?? '';
    const resolve = (name: string | null | undefined) =>
      this.resolveOutputUrl(
        organizationId,
        { projectId: log.projectId, typeGenerate },
        name,
      );
    const [resultUrl, thumbnailUrl, referenceImages] = await Promise.all([
      gallery
        ? Promise.all(resolveGalleryResultUrls(gallery).map(resolve))
        : Promise.resolve([]),
      resolve(gallery?.thumbnailUrl),
      this.storageUrl.toVerifiedDisplayUrls(log.referenceImages ?? []),
    ]);

    // Cast justified: LogRepository.findOne is not generic, so the included relations are
    // invisible to TypeScript even though Prisma returns them.
    const withRelations = log as typeof log & {
      project: { id: string; name: string } | null;
      users: { userId: string; fullname: string | null; username: string } | null;
    };

    return {
      id: log.id,
      taskId: log.taskId,
      typeGenerate: log.typeGenerate,
      type: toGenerationTypeKey(log.typeGenerate),
      status: log.status,
      prompt: log.prompt,
      usedCredit: log.usedCredit ?? 0,
      usedImage: log.usedImage ?? 0,
      resolution: log.resolution,
      ratio: log.ratio,
      generateAudio: log.generateAudio,
      generateConfig: log.generateConfig,
      createdAt: log.createdAt,
      projectId: withRelations.project?.id ?? log.projectId,
      projectName: withRelations.project?.name ?? null,
      userId: log.userId,
      userFullname:
        withRelations.users?.fullname ?? withRelations.users?.username ?? null,
      galleryId: gallery?.id ?? log.galleryId,
      genneratedStatus: gallery?.genneratedStatus ?? null,
      resultUrl: resultUrl.filter(Boolean),
      thumbnailUrl: thumbnailUrl || null,
      referenceImages,
    };
  }
}
