import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  GalleryRepository,
  LogRepository,
  WorkflowBlockRepository,
} from '@ai-media/share';
import { WorkflowBlock } from '@prisma/client';
import Redis from 'ioredis';
import { redisConfigs } from '../configs';
import { WorkflowGateway } from './workflow.gateway';

/**
 * ช่องสัญญาณ Redis ที่ worker-service เดิม publish อยู่แล้ว
 * (ดู websocket.gateway.ts) — เรา subscribe ซ้ำได้เพราะ Redis pub/sub รองรับหลาย subscriber
 * จึงไม่กระทบ gateway เดิม
 */
const WORKER_CHANNELS = [
  'worker:started',
  'worker:progress',
  'worker:image-complete',
  'worker:image-error',
  'worker:video-started',
  'worker:video-progress',
  'worker:video-url-success',
  'worker:video-upload-success',
  'worker:video-complete',
  'worker:video-error',
] as const;

/**
 * บริดจ์ระหว่าง pipeline เดิม → WorkflowBlock
 *
 * ฟัง event จาก worker (ผ่าน Redis) จับคู่ด้วย taskId กลับมายังบล็อก แล้ว:
 *  - อัปเดตสถานะ/progress/outputUrl/errorMessage ของบล็อก
 *  - เมื่อสำเร็จ "ประทับ" แถว log/gallery ที่ pipeline เดิมสร้างไว้ ให้เป็น featureType=workflow
 *  - emit `workflow.block.updated` ผ่าน WorkflowGateway
 *
 * event ที่ไม่มีบล็อกตรงกับ taskId = งาน generate ปกติ → ข้ามไป (ไม่กระทบของเดิม)
 */
@Injectable()
export class WorkflowEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkflowEventsService.name);
  private subscriber: Redis;

  constructor(
    private readonly blockRepo: WorkflowBlockRepository,
    private readonly logRepo: LogRepository,
    private readonly galleryRepo: GalleryRepository,
    private readonly gateway: WorkflowGateway,
  ) {}

  async onModuleInit(): Promise<void> {
    const conf = redisConfigs();
    this.subscriber = new Redis({
      host: conf.redisHost,
      port: conf.redisPort,
      ...(conf.redisPassword && { password: conf.redisPassword }),
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });

    this.subscriber.on('error', (err) =>
      this.logger.error('Workflow Redis subscriber error:', err),
    );

    await this.subscriber.subscribe(...WORKER_CHANNELS);
    this.subscriber.on('message', (channel, message) =>
      this.handleMessage(channel, message),
    );
    this.logger.log('✅ WorkflowEventsService listening to worker events');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.subscriber) await this.subscriber.quit();
  }

  /**
   * จัดการ message หนึ่งรายการจาก worker
   */
  private async handleMessage(channel: string, message: string): Promise<void> {
    try {
      const data = JSON.parse(message);
      const payload = data?.payload ?? {};
      const taskId: string | undefined = payload?.taskId;
      if (!taskId) return;

      const block = await this.blockRepo.findOne({ where: { taskId } });
      if (!block) return; // ไม่ใช่งานของ workflow → ข้าม

      // บล็อกที่จบแล้วไม่รับ event progress ที่มาช้า
      if (
        (block.status === 'success' || block.status === 'failed') &&
        !this.isTerminalChannel(channel)
      ) {
        return;
      }

      switch (channel) {
        case 'worker:image-complete':
          await this.onImageComplete(block, payload);
          break;
        case 'worker:video-upload-success':
          await this.onVideoUpload(block, payload);
          break;
        case 'worker:video-complete':
          await this.onVideoComplete(block, payload);
          break;
        case 'worker:image-error':
          await this.onError(block, payload);
          break;
        case 'worker:video-error':
          await this.onError(block, payload);
          break;
        default:
          await this.onProgress(block, payload);
      }
    } catch (error) {
      this.logger.error(
        `Error handling worker message on ${channel}: ${this.errMsg(error)}`,
      );
    }
  }

  /**
   * channel ที่ถือเป็นจุดจบของงาน (จบ/พลาด)
   */
  private isTerminalChannel(channel: string): boolean {
    return (
      channel === 'worker:image-complete' ||
      channel === 'worker:video-complete' ||
      channel === 'worker:image-error' ||
      channel === 'worker:video-error'
    );
  }

  /**
   * อัปเดต progress ระหว่างทาง (started/progress/url-success/per-image)
   */
  private async onProgress(
    block: WorkflowBlock,
    payload: Record<string, any>,
  ): Promise<void> {
    const progress = this.extractProgress(payload);
    await this.blockRepo.update({
      where: { id: block.id },
      data: { status: 'processing' },
    });
    this.gateway.emitBlockUpdate(payload.projectId, {
      blockId: block.id,
      status: 'processing',
      progress,
      outputUrl: block.outputUrl,
    });
  }

  /**
   * worker:image-complete มาได้ทั้งแบบรายรูป (มี index/total) และแบบจบงาน (success:true)
   */
  private async onImageComplete(
    block: WorkflowBlock,
    payload: Record<string, any>,
  ): Promise<void> {
    if (payload.success !== true) {
      // เป็น event ของรูปแต่ละใบ → ถือเป็น progress
      await this.onProgress(block, payload);
      return;
    }
    const outputUrl =
      payload?.data?.imageUrl ??
      payload?.imageUrl ??
      payload?.images?.[0]?.imageUrl ??
      null;
    await this.markSuccess(block, outputUrl, payload.projectId);
  }

  /**
   * เก็บ url วิดีโอที่อัปโหลดเสร็จ (ยังไม่ปิดงาน รอ worker:video-complete)
   */
  private async onVideoUpload(
    block: WorkflowBlock,
    payload: Record<string, any>,
  ): Promise<void> {
    const outputUrl = payload?.videoUrl ?? null;
    await this.blockRepo.update({
      where: { id: block.id },
      data: { status: 'processing', outputUrl },
    });
    this.gateway.emitBlockUpdate(payload.projectId, {
      blockId: block.id,
      status: 'processing',
      progress: 0.9,
      outputUrl,
    });
  }

  /**
   * ปิดงานวิดีโอเมื่อสำเร็จ
   */
  private async onVideoComplete(
    block: WorkflowBlock,
    payload: Record<string, any>,
  ): Promise<void> {
    const outputUrl = payload?.videoUrl ?? block.outputUrl ?? null;
    await this.markSuccess(block, outputUrl, payload.projectId);
  }

  /**
   * ตั้งบล็อกเป็น success + ประทับ featureType ลงแถว log/gallery ของ pipeline เดิม
   */
  private async markSuccess(
    block: WorkflowBlock,
    outputUrl: string | null,
    projectId: string,
  ): Promise<void> {
    const duration = (Date.now() - block.createdAt.getTime()) / 1000;
    await this.blockRepo.update({
      where: { id: block.id },
      data: { status: 'success', outputUrl, duration },
    });
    await this.stampFeatureRows(block);
    this.gateway.emitBlockUpdate(projectId, {
      blockId: block.id,
      status: 'success',
      progress: 1,
      outputUrl,
    });
  }

  /**
   * จัดการกรณีงานล้มเหลว
   */
  private async onError(
    block: WorkflowBlock,
    payload: Record<string, any>,
  ): Promise<void> {
    const errorMessage =
      payload?.error ?? payload?.message ?? 'Generation failed';
    await this.blockRepo.update({
      where: { id: block.id },
      data: { status: 'failed', errorMessage },
    });
    this.gateway.emitBlockUpdate(payload.projectId, {
      blockId: block.id,
      status: 'failed',
      errorMessage,
    });
  }

  /**
   * ประทับ featureType='workflow' + refFeatureId=conversationId ลงแถว log/gallery
   * ที่ pipeline เดิมสร้างไว้ (เราไม่แก้โค้ด insert เดิม แค่อัปเดตหลังงานเสร็จ)
   */
  private async stampFeatureRows(block: WorkflowBlock): Promise<void> {
    if (!block.taskId) return;
    const data = {
      featureType: 'workflow',
      refFeatureId: block.workflowConversationId,
    };
    await Promise.all([
      this.logRepo.updateMany({ where: { taskId: block.taskId }, data }),
      this.galleryRepo.updateMany({ where: { taskId: block.taskId }, data }),
    ]);
  }

  /**
   * ดึงค่า progress 0–1 จาก payload (รองรับทั้ง percentage และ index/total)
   */
  private extractProgress(payload: Record<string, any>): number | undefined {
    if (typeof payload.percentage === 'number') {
      return Math.min(1, Math.max(0, payload.percentage / 100));
    }
    if (
      typeof payload.index === 'number' &&
      typeof payload.total === 'number' &&
      payload.total > 0
    ) {
      return Math.min(1, payload.index / payload.total);
    }
    return undefined;
  }

  private errMsg(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
