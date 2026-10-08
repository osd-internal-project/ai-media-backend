import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue, UnrecoverableError } from 'bullmq';
import { Logger, Injectable } from '@nestjs/common';
import {
  GalleryRepository,
  LogRepository,
  MasterdataModelTypeRepository,
  MAX_CONCURRENT_TASKS_PER_TYPE,
  QUEUE_NAME_VDO,
  RefImageRepository,
  RequestVideoGenerateDto,
  StorageUrlService,
  TosService,
  VIDEO_JOB_FINALIZE,
  VIDEO_JOB_POLL_CHECK,
  BYTEPLUS_TERMINAL_STATUSES,
  buildByteplusVideoCallbackUrl,
} from '@ai-media/share';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { Redis } from 'ioredis';
import { OnWorkerEvent } from '@nestjs/bullmq';
import axios from 'axios';
import * as https from 'https';
import { GenerateHelperService } from './generate-helper.service';
import { VideoStorageService } from './video-storage.service';

/** ctx ของงานที่ส่งแล้ว — finalize ต้องใช้ แต่ callback ส่งมาแค่ taskId */
const VIDEO_CTX_TTL_SEC = 24 * 60 * 60;
/** poll สำรองห่าง ๆ เผื่อ callback ไม่มา */
const VIDEO_POLL_INTERVAL_MS = 2 * 60 * 1000;
/** เท่ากับ timeout ของ loop polling เดิม */
const VIDEO_POLL_TIMEOUT_MS = 20 * 60 * 1000;

const videoCtxKey = (taskId: string) => `video-ctx:${taskId}`;
const videoFinalKey = (taskId: string) => `video-final:${taskId}`;
const isTerminal = (status: string) =>
  (BYTEPLUS_TERMINAL_STATUSES as readonly string[]).includes(status);

interface VideoTaskContext {
  taskId: string;
  clientId: string;
  body: RequestVideoGenerateDto;
  userId: string;
  statusBaseUrl: string;
  authToken: string;
  videoTaskId: string;
  submittedAt: number;
}

interface ProviderVideoResult {
  status: string;
  data: unknown;
}

interface ProjectMemberCredit {
  usedCreditAllowance: number;
  holdCreditAllowance: number;
}

interface VideoProcessJob {
  taskId: string;
  clientId: string;
  body: RequestVideoGenerateDto;
  userId: string;
  sendApi: string;
  sendConfig: {
    type: string;
    configType: string;
    authorization: string;
    [k: string]: unknown;
  };
  statusBaseUrl: string | null;
}

interface BytepluseResponse {
  id: string;
  model: string;
  status: string;
  content: {
    video_url: string;
  };
  usage: {
    completion_tokens: number;
    total_tokens: number;
  };
  created_at: number;
  updated_at: number;
  seed: number;
  resolution: string;
  ratio: string;
  duration: number;
  framespersecond: number;
  service_tier: string;
  execution_expires_after: number;
  generate_audio: boolean;
  draft: boolean;
}
// บอกว่า Class นี้รับผิดชอบคิวชื่อ 'image-Video-queue'
// concurrency: 5 คือ ทำพร้อมกันได้ 5 งาน (ถ้าเครื่องไหว)
@Injectable()
@Processor(QUEUE_NAME_VDO, { concurrency: MAX_CONCURRENT_TASKS_PER_TYPE })
export class VideoProcessor extends WorkerHost {
  private readonly logger = new Logger(VideoProcessor.name);
  private agent: https.Agent;
  private redisPublisher: Redis;

  constructor(
    @InjectRedis() private readonly redis: Redis,
    private readonly galleryRepo: GalleryRepository,
    private readonly logrepo: LogRepository,
    private readonly refImageRepository: RefImageRepository,
    private readonly tosService: TosService,
    private readonly storageUrl: StorageUrlService,
    private readonly videoStorage: VideoStorageService,
    private readonly generateHelperService: GenerateHelperService,
    private readonly masterModelTypeRepo: MasterdataModelTypeRepository,
    @InjectQueue(QUEUE_NAME_VDO) private readonly videoQueue: Queue,
  ) {
    super();
    this.agent = new https.Agent({
      rejectUnauthorized: false,
    });

    // สร้าง Redis Publisher สำหรับส่ง events ไปยัง Core Service
    this.redisPublisher = new Redis({
      host: process.env.REDIS_HOST,
      port: Number(process.env.REDIS_PORT),
      ...(process.env.REDIS_PASSWORD && {
        password: process.env.REDIS_PASSWORD,
      }),
    });
  }

  @OnWorkerEvent('active')
  onActive(job: Job) {
    this.logger.log(`🟢 Job ${job.id} is now active`);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(`✅ Job ${job.id} completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`❌ Job ${job.id} failed: ${error.message}`);
  }

  async process(job: any, token?: string): Promise<any> {
    if (job.name === VIDEO_JOB_FINALIZE) return this.handleFinalize(job);
    if (job.name === VIDEO_JOB_POLL_CHECK) return this.handlePollCheck(job);
    return this.handleSubmit(job);
  }

  /**
   * ส่งงานให้ provider แล้วคืน worker slot ทันที — ผลมาทาง callback (finalize) หรือ poll-check สำรอง
   * job เก่าที่มี `videoTaskId` อยู่แล้ว (retry/stalled) ไม่ส่งซ้ำ แค่ตั้ง poll-check ใหม่
   */
  private async handleSubmit(job: Job): Promise<unknown> {
    const {
      taskId,
      clientId,
      body,
      userId,
      statusBaseUrl,
      sendApi,
      sendConfig,
    } = job.data as VideoProcessJob;
    // Per-org LLM gateway key set by the producer (falls back to the model token).
    const authorization: string =
      (job.data as any).authorization ?? sendConfig?.authorization ?? '';

    this.logger.log(`👨‍🍳 Submitting job: ${job.id}, Task: ${taskId}`);

    try {
      let videoTaskId: string;
      let authToken: string = authorization;
      if ((job.data as any).videoTaskId) {
        videoTaskId = (job.data as any).videoTaskId;
      } else {
        const axiosConfig = {
          headers: {
            'Content-Type': sendConfig.configType,
            Authorization: `Bearer ${authorization}`,
          },
          httpsAgent: this.agent,
        };
        const payload = await this.buildPayload(body, sendConfig, taskId);
        let apiRes: any;
        try {
          apiRes = await axios.post(sendApi, payload, axiosConfig);
          await this.generateHelperService.logAudit(
            userId,
            'CREATE',
            body,
            taskId,
          );
        } catch (error: any) {
          // Surface the real API rejection reason. Log the verbose detail
          // (payload + response) server-side for debugging, but throw only the
          // clean message. The outer catch owns all failure reporting.
          const apiStatus = error.response?.status;
          const apiBody = error.response?.data;
          const apiMessage =
            apiBody?.error?.message ?? apiBody?.message ?? error.message;
          this.logger.error(
            `❌ Video API call failed: API ${apiStatus}: ${apiMessage} | payload=${JSON.stringify(
              payload,
            )} | response=${JSON.stringify(apiBody)}`,
          );

          throw new UnrecoverableError(apiMessage);
        }

        videoTaskId = apiRes.data.id;
        authToken = String(sendConfig.authorization ?? '');
        await this.updateTaskStatus(taskId, { videoTaskId });
        // Persist into the job payload so a BullMQ retry/stalled re-process
        // resumes this provider task instead of submitting a new one.
        await job.updateData({ ...(job.data as any), videoTaskId });
      }

      // บันทึกสิ่งที่ finalize ต้องใช้ — callback ส่งมาแค่ taskId
      const ctx: VideoTaskContext = {
        taskId,
        clientId,
        body,
        userId,
        statusBaseUrl,
        authToken,
        videoTaskId,
        submittedAt: Date.now(),
      };
      await this.redis.set(
        videoCtxKey(taskId),
        JSON.stringify(ctx),
        'EX',
        VIDEO_CTX_TTL_SEC,
      );

      await this.publishToCore(clientId, 'worker:video-started', {
        taskId,
        timestamp: new Date().toISOString(),
        type: 'video',
        projectId: body.projectId,
      });
      await this.updateTaskStatus(taskId, {
        status: 'processing',
        startedAt: new Date().toISOString(),
      });
      await this.schedulePollCheck(taskId);
      this.logger.log(
        `📨 Task ${taskId} submitted (provider ${videoTaskId}) — waiting for callback / poll-check`,
      );
      return { submitted: true, taskId, videoTaskId };
    } catch (error) {
      await this.failTask({ taskId, clientId, body, userId }, error as Error);
      throw error;
    }
  }

  /** job จาก webhook ของ core — เช็คสถานะจริงกับ provider ก่อนปิดงาน (ไม่เชื่อ body ของ callback) */
  private async handleFinalize(job: Job): Promise<unknown> {
    const { taskId } = job.data as { taskId: string };
    const ctx = await this.loadCtx(taskId);
    if (!ctx) {
      if (await this.redis.exists(videoFinalKey(taskId))) {
        return { skipped: 'already finalized' };
      }
      // callback มาก่อน submit บันทึก ctx เสร็จ — ให้ BullMQ retry (attempts/backoff ตั้งที่ core)
      throw new Error(`video ctx for ${taskId} not found yet`);
    }
    const result = await this.fetchProviderStatus(ctx);
    if (!isTerminal(result.status)) {
      return { pending: result.status };
    }
    this.logger.log(`🔔 [callback] ${taskId} → ${result.status}`);
    await this.finalizeVideoTask(ctx, result);
    return { finalized: result.status };
  }

  /** สำรองกรณี callback ไม่มา: GET สถานะ 1 ครั้งต่อรอบ จนจบหรือเกินเวลา */
  private async handlePollCheck(job: Job): Promise<unknown> {
    const { taskId } = job.data as { taskId: string };
    if (await this.redis.exists(videoFinalKey(taskId))) {
      return { skipped: 'already finalized' };
    }
    const ctx = await this.loadCtx(taskId);
    if (!ctx) {
      this.logger.warn(`poll-check ${taskId}: ctx expired — nothing to do`);
      return { skipped: 'no ctx' };
    }
    if (Date.now() - ctx.submittedAt > VIDEO_POLL_TIMEOUT_MS) {
      await this.failOnce(ctx, new Error('generation timed out'));
      return { timedOut: true };
    }
    let result: ProviderVideoResult;
    try {
      result = await this.fetchProviderStatus(ctx);
    } catch (error) {
      // GET ล้มชั่วคราว (network/5xx) — ลองรอบหน้า ไม่ fail งาน
      this.logger.warn(
        `poll-check ${taskId}: status request failed — ${
          (error as Error).message
        }`,
      );
      await this.schedulePollCheck(taskId);
      return { retry: true };
    }
    if (isTerminal(result.status)) {
      this.logger.log(`⏱️ [poll-check] ${taskId} → ${result.status}`);
      await this.finalizeVideoTask(ctx, result);
      return { finalized: result.status };
    }
    await this.publishToCore(ctx.clientId, 'worker:video-progress', {
      taskId,
      timestamp: new Date().toISOString(),
      type: 'video',
      projectId: ctx.body.projectId,
    });
    await this.schedulePollCheck(taskId);
    return { pending: result.status };
  }

  /**
   * ปิดงานครั้งเดียวต่อ taskId (callback + poll-check อาจมาพร้อมกัน) — กันตัด/คืนเครดิตซ้ำ
   * succeeded → เก็บไฟล์ + ตัดเครดิตจริง · failed/expired/cancelled → fail path (คืนเครดิต)
   */
  private async finalizeVideoTask(
    ctx: VideoTaskContext,
    result: ProviderVideoResult,
  ): Promise<void> {
    const acquired = await this.redis.set(
      videoFinalKey(ctx.taskId),
      '1',
      'EX',
      VIDEO_CTX_TTL_SEC,
      'NX',
    );
    if (acquired === null) {
      this.logger.log(`Task ${ctx.taskId} already finalized — skip`);
      return;
    }
    try {
      if (result.status === 'succeeded') {
        await this.completeVideoTask(ctx, result.data as BytepluseResponse);
      } else {
        await this.failTask(ctx, new Error(`provider task ${result.status}`));
      }
    } catch (error) {
      // เก็บไฟล์/อัปเดต DB ล้มหลังได้ lock แล้ว — ต้องปิดเป็น failed เอง ไม่งั้นค้าง processing
      await this.failTask(ctx, error as Error);
    } finally {
      await this.redis.del(videoCtxKey(ctx.taskId));
    }
  }

  /** โค้ด success เดิมจาก loop polling — ย้ายมาเรียกจาก finalize */
  private async completeVideoTask(
    ctx: VideoTaskContext,
    data: BytepluseResponse,
  ): Promise<void> {
    const { taskId, clientId, body, userId } = ctx;
    const redisVideoCacheKey = `${body.organizationId}/${body.projectId}/credit_used_${userId}`;
    const { content, usage } = data;
    await this.publishToCore(clientId, 'worker:video-url-success', {
      taskId,
      videoUrl: content.video_url,
      timestamp: new Date().toISOString(),
      type: 'video',
      projectId: body.projectId,
    });
    const result = await this.videoStorage.storeVideoWithThumbnail({
      organizationId: body.organizationId,
      projectId: body.projectId,
      typeGenerate: 'video',
      sourceUrl: content.video_url,
      durationSec: Number(body.duration) || undefined,
    });

    await this.publishToCore(clientId, 'worker:video-upload-success', {
      taskId,
      videoUrl: await this.storageUrl.resolveOutputUrl(
        body.organizationId,
        body.projectId,
        'video',
        result.file,
      ),
      thumbnailUrl: await this.storageUrl.resolveOutputUrl(
        body.organizationId,
        body.projectId,
        'video',
        result.thumbnail,
      ),
      timestamp: new Date().toISOString(),
      type: 'video',
      projectId: body.projectId,
    });
    const log = await this.logrepo.findOne({
      where: { taskId: taskId },
    });
    const modelDto = await this.masterModelTypeRepo.findOne({
      where: { modelType: body.model, isActive: true },
    });
    const realCredit = await this.generateHelperService.getUsedCredit(
      usage.total_tokens,
      body,
      modelDto,
    );
    await this.galleryRepo.updateMany({
      where: { taskId: taskId },
      data: {
        imageUrl: result.file,
        resultUrl: [result.file],
        thumbnailUrl: result.thumbnail,
        genneratedStatus: 'SUCCESS',
        usedCredit: realCredit.credit,
        // denormalize token จริงจาก log ลง gallery (dual-write)
        tokenUsed: usage.total_tokens,
      },
    });

    await this.logrepo.updateMany({
      where: { taskId: taskId },
      data: {
        status: 'success',
        tokenUsed: usage.total_tokens,
        usedCredit: realCredit.credit,
      },
    });

    if (log) {
      const updated = (await this.generateHelperService.updateUsedCreditSuccess(
        userId,
        body.organizationId,
        body.projectId,
        'credit',
        realCredit.credit,
        log.usedCredit,
      )) as ProjectMemberCredit;
      const usedCredit =
        updated.usedCreditAllowance + updated.holdCreditAllowance;
      await this.redis.set(
        redisVideoCacheKey,
        usedCredit.toString(),
        'EX',
        60 * 60,
      );
    }

    await this.updateTaskStatus(taskId, {
      status: 'completed',
      completedAt: new Date().toISOString(),
    });
    await this.publishToCore(clientId, 'worker:video-complete', {
      taskId,
      success: true,
      timestamp: new Date().toISOString(),
      type: 'video',
      projectId: body.projectId,
    });
    this.logger.log(`🎉 Job ${taskId} completed!`);
  }

  /** fail path เดิม (เคยอยู่ใน catch ของ process) — สถานะ failed, แจ้ง core, คืนเครดิต, gallery FAILED */
  private async failTask(
    ctx: Pick<VideoTaskContext, 'taskId' | 'clientId' | 'body' | 'userId'>,
    err: Error,
  ): Promise<void> {
    const { taskId, clientId, body, userId } = ctx;
    const redisVideoCacheKey = `${body.organizationId}/${body.projectId}/credit_used_${userId}`;
    this.logger.error(`❌ Task ${taskId} failed: ${err.message}`, err.stack);

    await this.updateTaskStatus(taskId, {
      status: 'failed',
      failedAt: new Date().toISOString(),
      error: err.message,
    });
    await this.publishToCore(clientId, 'worker:video-error', {
      taskId,
      error: err.message,
      timestamp: new Date().toISOString(),
      type: 'video',
      projectId: body.projectId,
      message: err.message,
    });
    await this.logrepo.updateMany({
      where: { taskId },
      data: {
        status: 'failed',
      },
    });
    const failedLog = await this.logrepo.findOne({
      where: { taskId },
    });
    const updated = (await this.generateHelperService.updateUsedCreditFail(
      userId,
      body.organizationId,
      body.projectId,
      'credit',
      failedLog.usedCredit,
    )) as ProjectMemberCredit;

    const usedCredit =
      updated.usedCreditAllowance + updated.holdCreditAllowance;
    await this.redis.set(
      redisVideoCacheKey,
      usedCredit.toString(),
      'EX',
      60 * 60,
    );
    await this.galleryRepo.updateMany({
      where: { taskId },
      data: {
        genneratedStatus: 'FAILED',
      },
    });
  }

  /** fail ที่เกิดหลัง submit (timeout) — ใช้ lock เดียวกับ finalize กันคืนเครดิตซ้ำ */
  private async failOnce(ctx: VideoTaskContext, err: Error): Promise<void> {
    const acquired = await this.redis.set(
      videoFinalKey(ctx.taskId),
      '1',
      'EX',
      VIDEO_CTX_TTL_SEC,
      'NX',
    );
    if (acquired === null) return;
    try {
      await this.failTask(ctx, err);
    } finally {
      await this.redis.del(videoCtxKey(ctx.taskId));
    }
  }

  private async loadCtx(taskId: string): Promise<VideoTaskContext | null> {
    const raw = await this.redis.get(videoCtxKey(taskId));
    return raw ? (JSON.parse(raw) as VideoTaskContext) : null;
  }

  private async fetchProviderStatus(
    ctx: VideoTaskContext,
  ): Promise<ProviderVideoResult> {
    const authHeader = ctx.authToken.startsWith('Bearer ')
      ? ctx.authToken
      : `Bearer ${ctx.authToken}`;
    const res = await axios.get(`${ctx.statusBaseUrl}/${ctx.videoTaskId}`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      httpsAgent: this.agent,
    });
    return { status: String(res.data?.status ?? ''), data: res.data };
  }

  private async schedulePollCheck(taskId: string): Promise<void> {
    await this.videoQueue.add(
      VIDEO_JOB_POLL_CHECK,
      { taskId },
      {
        delay: VIDEO_POLL_INTERVAL_MS,
        removeOnComplete: { age: 24 * 60 * 60 },
        removeOnFail: { age: 24 * 60 * 60 },
      },
    );
  }

  /**
   * ส่ง event ไปยัง Core Service ผ่าน Redis Pub/Sub
   */
  private async publishToCore(clientId: string, event: string, payload: any) {
    const parts = event.split(':');
    const channel = `worker:${parts[parts.length - 1] || 'event'}`;
    try {
      await this.redisPublisher.publish(
        channel,
        JSON.stringify({
          clientId,
          event,
          payload,
          timestamp: new Date().toISOString(),
        }),
      );
    } catch (error) {
      this.logger.error(`Failed to publish event: ${(error as Error).message}`);
    }
  }

  /**
   * อัพเดทสถานะของ task ใน Redis
   */
  private async updateTaskStatus(taskId: string, updates: any) {
    const taskData = await this.redis.get(`task:${taskId}`);
    if (taskData) {
      const task = JSON.parse(taskData);
      const updatedTask = { ...task, ...updates };
      await this.redis.set(
        `task:${taskId}`,
        JSON.stringify(updatedTask),
        'EX',
        60 * 60,
      );
    }
  }

  // แยก builder แต่ละ model เป็น private method
  private readonly payloadBuilders: Record<
    string,
    (body: RequestVideoGenerateDto, modelDetail: any) => any
  > = {
    seedance1: this.buildSeedance1Payload.bind(this),
    seedance2: this.buildSeedance2Payload.bind(this),
  };

  private async buildPayload(
    body: RequestVideoGenerateDto,
    sendConfig: any,
    taskId: string,
  ) {
    const builder = this.payloadBuilders[sendConfig?.type];
    if (!builder) {
      // ไม่มี builder = config ใน master_model_type ผิด retry ไปก็ไม่หาย
      throw new UnrecoverableError(
        `Unsupported video sendConfig.type: "${sendConfig?.type}"`,
      );
    }
    const payload = await builder(body, sendConfig);
    // ไม่ได้ตั้ง BYTEPLUS_CALLBACK_* → null → ไม่ใส่ field (ได้ผลจาก poll-check อย่างเดียว)
    const callbackUrl = buildByteplusVideoCallbackUrl(taskId);
    return callbackUrl ? { ...payload, callback_url: callbackUrl } : payload;
  }

  /**
   * presign เฉพาะค่าที่เป็น object key — ถ้าเป็น URL อยู่แล้ว (เช่น reference จาก workflow
   * ที่ presign ตั้งแต่ submit) ส่งต่อตรง ๆ ไม่ presign ซ้ำ
   *
   * @param value object key หรือ URL
   * @returns URL ที่ provider ดาวน์โหลดได้
   * @throws เมื่อ presign ไม่สำเร็จ — ยอมให้ job fail ดีกว่ายิง url ว่างไปหา provider
   */
  private async presignRef(value: string): Promise<string> {
    return this.storageUrl.toProviderUrl(value);
  }

  private async buildSeedance1Payload(
    body: RequestVideoGenerateDto,
    _modelDetail: any,
  ) {
    // seedance1 supports ONLY first_frame / last_frame image roles (no
    // reference_* roles like seedance2). Explicit frame slots (body.image) take
    // precedence, then fall back to image-type reference uploads (body.files) —
    // the seedance1 UI currently sends its uploads there. Video/audio files and
    // anything beyond two frames are unsupported by seedance1 → skipped.
    const frameRefs = [
      ...body.image.filter((ref): ref is string => Boolean(ref)),
      ...body.files.filter((f) => f.type === 'image').map((f) => f.url),
    ].slice(0, 2);

    const frameRoles = ['first_frame', 'last_frame'] as const;
    const frameContent = await Promise.all(
      frameRefs.map(async (ref, i) => ({
        type: 'image_url',
        image_url: {
          url: await this.presignRef(ref),
        },
        role: frameRoles[i],
      })),
    );

    return {
      model: body.model,
      content: [{ type: 'text', text: body.prompt }, ...frameContent],
      draft: body.draft,
      generate_audio: body.generateAudio,
      ratio: body.ratio,
      duration: body.duration,
      watermark: body.watermark,
      resolution: body.resolution,
    };
  }

  private async buildSeedance2Payload(
    body: RequestVideoGenerateDto,
    _modelDetail: any,
  ) {
    const filesUrl = await Promise.all(
      body.files.map(async (file) => {
        if (file.type === 'image') {
          return {
            type: 'image_url',
            image_url: {
              url: await this.presignRef(file.url),
            },
            role: 'reference_image',
          };
        } else if (file.type === 'video') {
          return {
            type: 'video_url',
            video_url: {
              url: await this.presignRef(file.url),
            },
            role: 'reference_video',
          };
        } else {
          return {
            type: 'audio_url',
            audio_url: {
              url: await this.presignRef(file.url),
            },
            role: 'reference_audio',
          };
        }
      }),
    );
    return {
      model: body.model,
      content: [
        { type: 'text', text: body.prompt },
        ...filesUrl,
        ...(body.image[0]
          ? [
              {
                type: 'image_url',
                image_url: {
                  url: await this.presignRef(body.image[0]),
                },
                role: 'first_frame',
              },
            ]
          : []),
        ...(body.image[1]
          ? [
              {
                type: 'image_url',
                image_url: {
                  url: await this.presignRef(body.image[1]),
                },
                role: 'last_frame',
              },
            ]
          : []),
      ],
      draft: body.draft,
      generate_audio: body.generateAudio,
      ratio: body.ratio,
      duration: body.duration,
      watermark: body.watermark,
      resolution: body.resolution,
    };
  }

  async onModuleDestroy() {
    await this.redisPublisher.quit();
  }
}
