import { Injectable, Logger } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Prisma } from '@prisma/client';
import {
  ActivityShareLogRepository,
  ActivityShareRepository,
  ActivityShareTargetRepository,
  MAX_CONCURRENT_SOCIAL_PUBLISH,
  PublishError,
  QUEUE_NAME_SOCIAL_PUBLISH,
  ResolvedMedia,
  ShareMediaItem,
  SocialPlatform,
  SocialPublishJobData,
  SocialTokenService,
  StorageUrlService,
  VIDEO_GENERATE_TYPES,
  TraceJob,
} from '@ai-media/share';
import { Span } from 'nestjs-otel';
import { PublisherRegistry } from './publishers/publisher.registry';

/** target ที่กำลังจะเผยแพร่ */
interface TargetRow {
  id: string;
  socialAccountId: string;
  platform: string;
  attemptCount: number;
}

@Injectable()
@Processor(QUEUE_NAME_SOCIAL_PUBLISH, {
  concurrency: MAX_CONCURRENT_SOCIAL_PUBLISH,
})
export class SocialPublishProcessor extends WorkerHost {
  private readonly logger = new Logger(SocialPublishProcessor.name);

  constructor(
    private readonly shareRepo: ActivityShareRepository,
    private readonly targetRepo: ActivityShareTargetRepository,
    private readonly shareLogRepo: ActivityShareLogRepository,
    private readonly socialTokenService: SocialTokenService,
    private readonly storageUrl: StorageUrlService,
    private readonly publishers: PublisherRegistry,
  ) {
    super();
  }

  /**
   * ประมวลผลงานเผยแพร่ 1 ใบ
   *
   * แต่ละ target ทำแยกกันและ error ถูกกักไว้ในระดับ target — Instagram พังต้องไม่
   * ทำให้ Facebook ที่สำเร็จแล้วเสียหาย หรือทำให้ทั้ง job ถูก BullMQ retry ซ้ำจน
   * โพสต์ซ้ำบน platform ที่สำเร็จไปแล้ว
   *
   * @param job job ที่มี activityShareId (+ targetIds ตอน retry)
   * @returns สรุปจำนวนสำเร็จ/ล้มเหลว
   */
  @TraceJob()
  async process(job: any): Promise<any> {
    // ใช้ `any` ตาม processor ตัวอื่นในเซอร์วิสนี้ เพราะ bullmq ถูกติดตั้งสองชุด
    // (root + workspace) ทำให้ type `Job` ของสองชุดไม่ assignable กัน
    // — narrow ที่นี่แทนเพื่อให้ body ยังมี type จริง
    const { activityShareId, targetIds } = job.data as SocialPublishJobData;

    const share = await this.shareRepo.findUnique({
      where: { id: activityShareId },
    });
    if (!share) {
      this.logger.warn(`activity share ${activityShareId} no longer exists`);
      return { succeeded: 0, failed: 0 };
    }
    // งานอาจถูกประมวลผลไปแล้วจาก job ที่ซ้ำ — ไม่ทำต่อเพื่อกันโพสต์ซ้ำ
    if (share.status !== 'PENDING') {
      this.logger.warn(
        `activity share ${activityShareId} is ${share.status}, skipping`,
      );
      return { succeeded: 0, failed: 0 };
    }

    await this.transitionShare(activityShareId, 'PENDING', 'PUBLISHING', 'PUBLISH_START');

    const targets = (await this.targetRepo.findMany({
      where: {
        activityShareId,
        status: 'PENDING',
        ...(targetIds?.length && { id: { in: targetIds } }),
      },
    })) as TargetRow[];

    const media = await this.resolveMedia(share.mediaItems);

    let succeeded = 0;
    let failed = 0;
    for (const target of targets) {
      const ok = await this.publishTarget(activityShareId, target, {
        caption: share.caption,
        hashtags: share.hashtags,
        linkUrl: share.linkUrl,
        media,
      });
      ok ? succeeded++ : failed++;
    }

    await this.finalizeShareStatus(activityShareId);
    return { succeeded, failed };
  }

  /**
   * เผยแพร่ target เดียว แล้วบันทึกผลลง DB
   *
   * จับ error ไว้ทั้งหมดและคืนเป็น boolean แทนการโยนต่อ — ทั้ง job ต้องเดินต่อ
   * ให้ครบทุก target เสมอ
   *
   * @param activityShareId id ของงาน
   * @param target target ที่จะเผยแพร่
   * @param content เนื้อหาที่จะโพสต์
   * @returns true เมื่อสำเร็จ
   */
  @Span()
  private async publishTarget(
    activityShareId: string,
    target: TargetRow,
    content: {
      caption: string;
      hashtags: string[];
      linkUrl: string | null;
      media: ResolvedMedia[];
    },
  ): Promise<boolean> {
    await this.targetRepo.update({
      where: { id: target.id },
      data: {
        status: 'PUBLISHING',
        attemptCount: { increment: 1 },
      },
    });

    try {
      const account = await this.socialTokenService.resolveAccount(
        target.socialAccountId,
      );
      const publisher = this.publishers.get(target.platform as SocialPlatform);
      const result = await publisher.publish({
        account,
        caption: content.caption,
        hashtags: content.hashtags,
        linkUrl: content.linkUrl,
        media: content.media,
      });

      await this.targetRepo.update({
        where: { id: target.id },
        data: {
          status: 'SUCCESS',
          remotePostId: result.remotePostId,
          remoteUrl: result.remoteUrl,
          errorCode: null,
          errorMessage: null,
          publishedAt: new Date(),
        },
      });
      await this.writeSystemLog({
        activityShareId,
        activityShareTargetId: target.id,
        action: 'PUBLISH_SUCCESS',
        fromStatus: 'PUBLISHING',
        toStatus: 'SUCCESS',
        metadata: {
          platform: target.platform,
          remotePostId: result.remotePostId,
        },
      });
      return true;
    } catch (error) {
      const { code, message, payload } = this.describeError(error);
      this.logger.error(
        `publish failed for target ${target.id} (${target.platform}): ${message}`,
      );

      await this.targetRepo.update({
        where: { id: target.id },
        data: {
          status: 'FAILED',
          errorCode: code,
          errorMessage: message,
        },
      });
      await this.writeSystemLog({
        activityShareId,
        activityShareTargetId: target.id,
        action: 'PUBLISH_FAIL',
        fromStatus: 'PUBLISHING',
        toStatus: 'FAILED',
        note: message,
        metadata: { platform: target.platform, code, payload },
      });
      return false;
    }
  }

  /**
   * สรุปสถานะของงานจากผลของ target ทั้งหมด
   *
   * อ่านจาก DB ใหม่แทนการนับในหน่วยความจำ เพราะตอน retry มี target ที่สำเร็จ
   * ไปแล้วในรอบก่อนซึ่งไม่ได้อยู่ใน job รอบนี้
   *
   * @param activityShareId id ของงาน
   */
  @Span()
  private async finalizeShareStatus(activityShareId: string): Promise<void> {
    const targets = await this.targetRepo.findMany({
      where: { activityShareId },
    });
    const allSucceeded = targets.every((target) => target.status === 'SUCCESS');
    const toStatus = allSucceeded ? 'SUCCESS' : 'FAILED';

    await this.shareRepo.update({
      where: { id: activityShareId },
      data: { status: toStatus },
    });
    await this.writeSystemLog({
      activityShareId,
      action: allSucceeded ? 'PUBLISH_SUCCESS' : 'PUBLISH_FAIL',
      fromStatus: 'PUBLISHING',
      toStatus,
      metadata: {
        succeeded: targets.filter((t) => t.status === 'SUCCESS').length,
        failed: targets.filter((t) => t.status === 'FAILED').length,
      },
    });
  }

  /**
   * เปลี่ยนสถานะงานพร้อมเขียน log
   *
   * @param activityShareId id ของงาน
   * @param fromStatus สถานะเดิม
   * @param toStatus สถานะใหม่
   * @param action action ที่จะบันทึก
   */
  @Span()
  private async transitionShare(
    activityShareId: string,
    fromStatus: string,
    toStatus: string,
    action: string,
  ): Promise<void> {
    await this.shareRepo.update({
      where: { id: activityShareId },
      data: { status: toStatus },
    });
    await this.writeSystemLog({
      activityShareId,
      action,
      fromStatus,
      toStatus,
    });
  }

  /**
   * แปลง snapshot ใน media_items เป็น URL ที่ provider ดึงได้
   *
   * ใช้ toProviderUrl (send path ที่ throw เมื่อพัง) ไม่ใช่ toDisplayUrl —
   * placeholder "No Image" ต้องไม่มีทางหลุดขึ้นเพจของลูกค้า
   *
   * @param rawMediaItems ค่า media_items ดิบจาก DB
   * @returns สื่อที่ resolve เป็น URL แล้ว เรียงตาม order
   */
  @Span()
  private async resolveMedia(
    rawMediaItems: Prisma.JsonValue,
  ): Promise<ResolvedMedia[]> {
    const items = ((rawMediaItems ?? []) as unknown as ShareMediaItem[])
      .slice()
      .sort((a, b) => a.order - b.order);

    return Promise.all(
      items.map(async (item) => {
        const isVideo = VIDEO_GENERATE_TYPES.includes(item.typeGenerate);
        return {
          url: await this.storageUrl.toProviderUrl(item.resultKey),
          key: item.resultKey,
          isVideo,
          mimeType: isVideo ? 'video/mp4' : 'image/jpeg',
        };
      }),
    );
  }

  /**
   * เขียน activity_share_log โดยผู้กระทำเป็นระบบ
   *
   * @param entry ข้อมูล log
   */
  private async writeSystemLog(entry: {
    activityShareId: string;
    activityShareTargetId?: string;
    action: string;
    fromStatus: string | null;
    toStatus: string;
    note?: string;
    metadata?: unknown;
  }): Promise<void> {
    await this.shareLogRepo.create({
      data: {
        activityShareId: entry.activityShareId,
        activityShareTargetId: entry.activityShareTargetId ?? null,
        action: entry.action,
        fromStatus: entry.fromStatus,
        toStatus: entry.toStatus,
        actionUserId: null,
        actorType: 'SYSTEM',
        note: entry.note ?? null,
        ...(entry.metadata !== undefined && {
          metadata: entry.metadata as Prisma.InputJsonValue,
        }),
      },
    });
  }

  /**
   * ดึงรหัส/ข้อความ error ที่เก็บลง DB ได้
   *
   * @param error error ที่จับได้
   * @returns code, message และ payload ดิบจาก provider
   */
  private describeError(error: unknown): {
    code: string;
    message: string;
    payload: unknown;
  } {
    if (error instanceof PublishError) {
      return {
        code: error.code,
        message: error.message,
        payload: error.providerPayload ?? null,
      };
    }
    return {
      code: 'unknown',
      message: error instanceof Error ? error.message : String(error),
      payload: null,
    };
  }

  @OnWorkerEvent('active')
  onActive(job: Job<SocialPublishJobData>) {
    this.logger.log(`🟢 publishing share ${job.data.activityShareId}`);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<SocialPublishJobData>) {
    this.logger.log(`✅ finished share ${job.data.activityShareId}`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<SocialPublishJobData>, error: Error) {
    this.logger.error(
      `❌ job for share ${job?.data?.activityShareId} failed: ${error.message}`,
    );
  }
}
