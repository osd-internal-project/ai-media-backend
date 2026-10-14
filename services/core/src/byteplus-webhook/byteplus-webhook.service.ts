import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  BYTEPLUS_TERMINAL_STATUSES,
  QUEUE_NAME_VDO,
  VIDEO_JOB_FINALIZE,
} from '@ai-media/share';

export interface VideoFinalizeJobData {
  taskId: string;
  providerTaskId: string | null;
}

@Injectable()
export class ByteplusWebhookService {
  private readonly logger = new Logger(ByteplusWebhookService.name);

  constructor(@InjectQueue(QUEUE_NAME_VDO) private readonly videoQueue: Queue) {}

  /**
   * แปลง callback เป็น job finalize ใน worker
   *
   * ใช้ body แค่ id/status เป็นสัญญาณ — worker จะ GET สถานะจริงจาก provider เองก่อนปิดงาน
   * jobId คงที่ต่อ taskId จึงกัน callback ซ้ำ (BullMQ ไม่ add job ที่ id ซ้ำ)
   */
  async handleVideoCallback(
    taskId: string,
    body: unknown,
    headers: Record<string, string>,
  ): Promise<void> {
    const { id, status } = this.readStatus(body);
    // log เต็มไว้ดูรูปแบบจริงของ Ark (Phase 0 ยังไม่ได้ยืนยัน header/retry)
    this.logger.log(
      `BytePlus callback task=${taskId} provider=${id} status=${status} headers=${JSON.stringify(
        headers,
      )} body=${JSON.stringify(body)}`,
    );

    if (!status || !this.isTerminal(status)) return;

    const data: VideoFinalizeJobData = { taskId, providerTaskId: id };
    await this.videoQueue.add(VIDEO_JOB_FINALIZE, data, {
      jobId: `${VIDEO_JOB_FINALIZE}-${taskId}`,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: { age: 24 * 60 * 60 },
    });
  }

  private readStatus(body: unknown): {
    id: string | null;
    status: string | null;
  } {
    if (!body || typeof body !== 'object') return { id: null, status: null };
    const record = body as Record<string, unknown>;
    return {
      id: typeof record.id === 'string' ? record.id : null,
      status: typeof record.status === 'string' ? record.status : null,
    };
  }

  private isTerminal(status: string): boolean {
    return (BYTEPLUS_TERMINAL_STATUSES as readonly string[]).includes(status);
  }
}
