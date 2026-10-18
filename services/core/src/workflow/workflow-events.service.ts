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
import { WebsocketGatewayService } from '../websocket/websocket.gateway';
import { WorkflowMediaService } from './workflow-media.service';

/** payload ของ event workflow.block.updated ที่ส่งให้ frontend */
interface WorkflowBlockUpdatePayload {
  blockId: string;
  status: 'pending' | 'processing' | 'success' | 'failed';
  progress?: number;
  outputUrl?: string | null;
  errorMessage?: string | null;
}

/** สถานะที่ event จาก worker ยังเปลี่ยนต่อได้ */
const ACTIVE_STATUSES = ['pending', 'processing'];

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
 *  - emit `workflow.block.updated` ผ่าน WebsocketGatewayService เดิม (server เดียวกับ client)
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
    private readonly gateway: WebsocketGatewayService,
    private readonly mediaService: WorkflowMediaService,
  ) {}

  /**
   * ส่ง event workflow.block.updated เข้าห้อง `${projectId}:workflow`
   * ผ่าน gateway เดิม (server เดียวกับที่ client เชื่อมต่อ)
   */
  private emitUpdate(
    projectId: string,
    payload: WorkflowBlockUpdatePayload,
  ): void {
    this.gateway.emitToRoom(
      `${projectId}:workflow`,
      'workflow.block.updated',
      payload,
    );
  }

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
        !this.isTerminalEvent(channel, payload)
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
   * event ที่ถือเป็นจุดจบของงาน (จบ/พลาด)
   * - worker:image-complete รายรูป (ไม่มี success:true) เป็นแค่ progress
   */
  private isTerminalEvent(
    channel: string,
    payload: Record<string, any>,
  ): boolean {
    if (channel === 'worker:image-complete') return payload?.success === true;
    return (
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
    if (!(await this.markProcessing(block))) return;
    this.emitUpdate(payload.projectId, {
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
    // ดึง object name จาก gallery row ที่ worker เขียนไว้ (canonical) — fallback จาก payload
    const objectName =
      (await this.resolveObjectName(block.taskId)) ??
      this.firstString(payload?.images) ??
      this.firstString(payload?.data?.imageUrl) ??
      this.firstString(payload?.imageUrl);
    await this.markSuccess(block, objectName, payload.projectId);
  }

  /**
   * worker:video-upload-success — แค่แจ้ง progress (ยังไม่ปิดงาน รอ worker:video-complete)
   */
  private async onVideoUpload(
    block: WorkflowBlock,
    payload: Record<string, any>,
  ): Promise<void> {
    if (!(await this.markProcessing(block))) return;
    this.emitUpdate(payload.projectId, {
      blockId: block.id,
      status: 'processing',
      progress: 0.9,
      // วิดีโอที่อัปโหลดแล้วมักเป็น presigned url อยู่แล้ว — ใช้แสดง preview ระหว่างรอจบงาน
      outputUrl: this.firstString(payload?.videoUrl),
    });
  }

  /**
   * ปิดงานวิดีโอเมื่อสำเร็จ
   */
  private async onVideoComplete(
    block: WorkflowBlock,
    payload: Record<string, any>,
  ): Promise<void> {
    const objectName =
      (await this.resolveObjectName(block.taskId)) ??
      this.firstString(payload?.videoUrl);
    await this.markSuccess(block, objectName, payload.projectId);
  }

  /**
   * ตั้งบล็อกเป็น success + เก็บ object name + ประทับ featureType + emit presigned url
   * - เก็บ object name ดิบใน outputUrl (ไม่ใช่ array, ไม่ใช่ presigned ที่หมดอายุ)
   * - presign ตอน emit เพื่อให้หน้าบ้านแสดงรูป/วิดีโอได้ทันที
   */
  private async markSuccess(
    block: WorkflowBlock,
    objectName: string | null,
    projectId: string,
  ): Promise<void> {
    const duration =
      block.duration ?? (Date.now() - block.createdAt.getTime()) / 1000;
    // taskId ต้องตรง — กัน event ของรอบก่อน retry มาปิดบล็อกที่กำลังรันรอบใหม่
    const { count } = await this.blockRepo.updateMany({
      where: { id: block.id, taskId: block.taskId },
      data: { status: 'success', outputUrl: objectName, duration },
    });
    if (count === 0) return;

    // ประทับ featureType แยก try/catch — ไม่ให้พังการ emit ถ้า stamp ล้มเหลว
    try {
      await this.stampFeatureRows(block);
    } catch (error) {
      this.logger.error(`stampFeatureRows failed: ${this.errMsg(error)}`);
    }

    const presignedUrl = await this.mediaService.presignObject(
      projectId,
      block.type,
      objectName,
    );
    this.emitUpdate(projectId, {
      blockId: block.id,
      status: 'success',
      progress: 1,
      outputUrl: presignedUrl,
    });
  }

  /**
   * ตั้งสถานะ processing แบบมีเงื่อนไข — core หลาย replica รับ event ชุดเดียวกัน
   * replica ที่ช้าต้องไม่เขียนทับ success/failed ที่อีกตัวเขียนไปแล้ว
   * @returns false เมื่อบล็อกจบไปแล้วหรือ taskId เปลี่ยน (ไม่ต้อง emit)
   */
  private async markProcessing(block: WorkflowBlock): Promise<boolean> {
    const { count } = await this.blockRepo.updateMany({
      where: {
        id: block.id,
        taskId: block.taskId,
        status: { in: ACTIVE_STATUSES },
      },
      data: { status: 'processing' },
    });
    return count > 0;
  }

  /**
   * ซ่อมบล็อกที่ค้าง processing ทั้งที่ gallery ของ task เป็น SUCCESS แล้ว
   * (ข้อมูลที่เสียจาก race ก่อนแก้ guard) — เรียกตอนโหลด conversation
   * @returns บล็อกหลังซ่อม หรือ null เมื่อไม่ต้องซ่อม
   */
  async healStuckBlock(
    block: WorkflowBlock,
    projectId: string,
  ): Promise<WorkflowBlock | null> {
    if (block.status !== 'processing' || !block.taskId) return null;
    const gallery = await this.galleryRepo.findOne({
      where: { taskId: block.taskId },
    });
    if (gallery?.genneratedStatus !== 'SUCCESS') return null;

    const objectName =
      this.firstString(gallery.resultUrl) ??
      this.firstString(gallery.imageUrl) ??
      block.outputUrl;
    await this.markSuccess(block, objectName, projectId);
    this.logger.warn(`Healed stuck workflow block ${block.id} → success`);
    return this.blockRepo.findOne({ where: { id: block.id } });
  }

  /**
   * ดึง object name ของ output จาก gallery row (แหล่งข้อมูล canonical ที่ worker เขียนไว้)
   */
  private async resolveObjectName(
    taskId: string | null,
  ): Promise<string | null> {
    if (!taskId) return null;
    const gallery = await this.galleryRepo.findOne({ where: { taskId } });
    // ใช้ resultUrl[] เป็นหลัก, fallback imageUrl เดี่ยวสำหรับ data เก่า (firstString รองรับทั้ง array/string)
    return (
      this.firstString(gallery?.resultUrl) ?? this.firstString(gallery?.imageUrl)
    );
  }

  /**
   * คืนค่า string ตัวแรก — รองรับทั้ง string เดี่ยวและ array (กัน outputUrl เป็น array)
   */
  private firstString(value: unknown): string | null {
    if (typeof value === 'string' && value.length > 0) return value;
    if (Array.isArray(value)) {
      const first = value.find((v) => typeof v === 'string' && v.length > 0);
      return (first as string) ?? null;
    }
    return null;
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
    const { count } = await this.blockRepo.updateMany({
      where: {
        id: block.id,
        taskId: block.taskId,
        status: { in: ACTIVE_STATUSES },
      },
      data: { status: 'failed', errorMessage },
    });
    if (count === 0) return;
    this.emitUpdate(payload.projectId, {
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
