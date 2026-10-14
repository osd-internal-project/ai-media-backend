import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  GalleryRepository,
  LogRepository,
  PhotoEventGenerationRepository,
  PhotoEventPhotoRepository,
  buildOutputKey,
} from '@ai-media/share';
import { PhotoEventGeneration } from '@prisma/client';
import Redis from 'ioredis';
import { redisConfigs } from '../configs';
import { PHOTO_EVENT_FEATURE_TYPE } from './photo-event.constants';
import { PhotoEventGenerationsService } from './photo-event-generations.service';

const WORKER_CHANNELS = [
  'worker:started',
  'worker:progress',
  'worker:image-complete',
  'worker:image-error',
] as const;

interface WorkerPayload {
  taskId?: string;
  success?: boolean;
  percentage?: number;
  index?: number;
  total?: number;
  images?: unknown;
  error?: string;
  message?: string;
}

/**
 * ฟัง event ของ worker (Redis pub/sub ซ้อนกับ gateway ได้) แล้วจับคู่ด้วย taskId
 * กับ PhotoEventGeneration — event ที่ไม่ใช่ของ Photo Event จะถูกข้าม
 */
@Injectable()
export class PhotoEventEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PhotoEventEventsService.name);
  private subscriber: Redis;

  constructor(
    private readonly generationRepo: PhotoEventGenerationRepository,
    private readonly photoRepo: PhotoEventPhotoRepository,
    private readonly galleryRepo: GalleryRepository,
    private readonly logRepo: LogRepository,
    private readonly generationsService: PhotoEventGenerationsService,
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
      this.logger.error('PhotoEvent Redis subscriber error:', err),
    );
    await this.subscriber.subscribe(...WORKER_CHANNELS);
    this.subscriber.on('message', (channel, message) =>
      this.handleMessage(channel, message),
    );
    this.logger.log('✅ PhotoEventEventsService listening to worker events');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.subscriber) await this.subscriber.quit();
  }

  private async handleMessage(channel: string, message: string): Promise<void> {
    try {
      const payload: WorkerPayload = JSON.parse(message)?.payload ?? {};
      if (!payload.taskId) return;

      const generation = await this.generationRepo.findOne({
        where: { taskId: payload.taskId },
      });
      if (!generation) return;
      if (generation.status === 'success' || generation.status === 'failed') {
        return;
      }

      if (channel === 'worker:image-error') {
        await this.onError(generation, payload);
      } else if (
        channel === 'worker:image-complete' &&
        payload.success === true
      ) {
        await this.onComplete(generation, payload);
      } else {
        await this.onProgress(generation, payload);
      }
    } catch (error) {
      this.logger.error(
        `Error handling worker message on ${channel}: ${this.errMsg(error)}`,
      );
    }
  }

  private async onProgress(
    generation: PhotoEventGeneration,
    payload: WorkerPayload,
  ): Promise<void> {
    const updated = await this.generationRepo.update({
      where: { id: generation.id },
      data: {
        status: 'processing',
        progress: this.extractProgress(payload) ?? generation.progress,
      },
    });
    await this.generationsService.emitUpdate(updated);
  }

  private async onComplete(
    generation: PhotoEventGeneration,
    payload: WorkerPayload,
  ): Promise<void> {
    const gallery = await this.galleryRepo.findOne({
      where: { taskId: generation.taskId },
    });
    const objectName =
      this.firstString(gallery?.resultUrl) ??
      this.firstString(gallery?.imageUrl) ??
      this.firstString(payload.images);
    if (!objectName) {
      await this.onError(generation, { message: 'Result image not found' });
      return;
    }

    const photo = await this.photoRepo.findOne({
      where: { id: generation.photoId },
    });
    if (!photo) {
      await this.onError(generation, { message: 'Source photo not found' });
      return;
    }

    const updated = await this.generationRepo.update({
      where: { id: generation.id },
      data: {
        status: 'success',
        progress: 100,
        outputKey: buildOutputKey(
          photo.organizationId,
          generation.projectId,
          'image',
          objectName,
        ),
        galleryId: gallery?.id ?? null,
      },
    });
    await this.stampFeatureRows(updated);
    await this.generationsService.emitUpdate(updated);
  }

  private async onError(
    generation: PhotoEventGeneration,
    payload: WorkerPayload,
  ): Promise<void> {
    const updated = await this.generationRepo.update({
      where: { id: generation.id },
      data: {
        status: 'failed',
        errorMessage: payload.error ?? payload.message ?? 'Generation failed',
      },
    });
    await this.generationsService.emitUpdate(updated);
  }

  /** stamp แยก try/catch เพื่อไม่ให้การแจ้งผลล้มตาม */
  private async stampFeatureRows(generation: PhotoEventGeneration) {
    const data = {
      featureType: PHOTO_EVENT_FEATURE_TYPE,
      refFeatureId: generation.id,
    };
    try {
      await Promise.all([
        this.logRepo.updateMany({ where: { taskId: generation.taskId }, data }),
        this.galleryRepo.updateMany({
          where: { taskId: generation.taskId },
          data,
        }),
      ]);
    } catch (error) {
      this.logger.error(`stampFeatureRows failed: ${this.errMsg(error)}`);
    }
  }

  /** progress 0–100 จาก percentage หรือ index/total */
  private extractProgress(payload: WorkerPayload): number | undefined {
    if (typeof payload.percentage === 'number') {
      return Math.round(Math.min(100, Math.max(0, payload.percentage)));
    }
    if (typeof payload.index === 'number' && payload.total) {
      return Math.round(Math.min(1, payload.index / payload.total) * 100);
    }
    return undefined;
  }

  private firstString(value: unknown): string | null {
    if (typeof value === 'string' && value.length > 0) return value;
    if (Array.isArray(value)) {
      const first = value.find(
        (v): v is string => typeof v === 'string' && v.length > 0,
      );
      return first ?? null;
    }
    return null;
  }

  private errMsg(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
