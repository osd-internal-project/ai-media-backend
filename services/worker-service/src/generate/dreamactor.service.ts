import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';
import { Logger, Injectable } from '@nestjs/common';
import {
  GalleryRepository,
  LogRepository,
  MAX_CONCURRENT_TASKS_PER_TYPE,
  QUEUE_NAME_DREAMACTOR,
  RefImageRepository,
  RequestDreamactorGenerateDto,
  StorageUrlService,
  TosService,
} from '@ai-media/share';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { Redis } from 'ioredis';
import { OnWorkerEvent } from '@nestjs/bullmq';
import axios from 'axios';
import * as https from 'https';
import { GenerateHelperService } from './generate-helper.service';
import { VideoStorageService } from './video-storage.service';

interface DreamactorProcessJob {
  taskId: string;
  clientId: string;
  body: RequestDreamactorGenerateDto;
  userId: string;
  dreamactorTaskId: string;
  reqKey: string;
  statusBaseUrl: string;
  sendApi?: string;
  sendConfig?: { type: string; [k: string]: unknown };
  /** task id จริงของ provider — ตั้งหลัง submit สำเร็จ ใช้กันส่งซ้ำตอน retry */
  providerTaskId?: string;
  submittedAt?: number;
}

const DREAMACTOR_POLL_INTERVAL_MS = 10_000;
/** เท่ากับ omnihuman — ความยาวงานขึ้นกับวิดีโออ้างอิง */
const DREAMACTOR_POLL_TIMEOUT_MS = 30 * 60 * 1000;
const DREAMACTOR_FINAL_TTL_SEC = 24 * 60 * 60;
const dreamactorFinalKey = (taskId: string) => `dreamactor-final:${taskId}`;

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
@Processor(QUEUE_NAME_DREAMACTOR, {
  concurrency: MAX_CONCURRENT_TASKS_PER_TYPE,
})
export class DreamactorProcessor extends WorkerHost {
  private readonly logger = new Logger(DreamactorProcessor.name);
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

  // `any` ตาม video.service — bullmq มี 2 สำเนา (root + worker) ทำให้ Job ของ WorkerHost ไม่ตรงกับที่ import
  async process(job: any, token?: string): Promise<unknown> {
    const data = job.data as DreamactorProcessJob;
    const { taskId, clientId, body, userId } = data;
    console.log(`taskId`, taskId, clientId, body, userId);

    this.logger.log(
      `👨‍🍳 Processing job: ${job.id}, Task: ${taskId} attempt=${
        job.attemptsMade + 1
      }`,
    );
    if (await this.redis.exists(dreamactorFinalKey(taskId))) {
      this.logger.log(`Task ${taskId} already finalized — skip`);
      return { skipped: 'already finalized' };
    }

    let finalizeError: Error | null;
    try {
      const { providerTaskId, submittedAt } = await this.submitOnce(job);

      // 1. ส่ง event "started" ไปยัง Core Service
      await this.publishToCore(clientId, 'worker:dreamactor-started', {
        taskId,
        timestamp: new Date().toISOString(),
        type: 'dreamactor',
        projectId: body.projectId,
      });

      // อัพเดทสถานะใน Redis
      await this.updateTaskStatus(taskId, {
        status: 'processing',
        startedAt: new Date().toISOString(),
      });

      const result = await this.pollUntilTerminal(
        data,
        providerTaskId,
        submittedAt,
      );
      finalizeError = await this.finalizeOnce(
        data,
        result.status === 'done'
          ? { videoUrl: result.videoUrl }
          : { error: new Error(result.message) },
      );
    } catch (error) {
      this.logger.error(
        `❌ Job ${job.id} failed: ${(error as Error).message}`,
        (error as Error).stack,
      );
      finalizeError = await this.finalizeOnce(data, { error: error as Error });
    }

    if (finalizeError) {
      // ปิดเป็น failed + คืนเครดิตแล้ว — retry จะส่งงาน provider ซ้ำและคืนเครดิตซ้ำ
      throw new UnrecoverableError(finalizeError.message);
    }

    this.logger.log(`🎉 Job ${taskId} completed!`);

    return {
      success: true,
      taskId,
      data: {
        projectId: body.projectId,
        userId,
        prompt: body.prompt,
        imageUrl: '',
        typeGenerate: 'image',
        genneratedStatus: 'SUCCESS',
        status: true,
        generateConfig: this.buildGenerateConfig({
          ratio: body.ratio,
          width: body.width,
          height: body.height,
          prompt: body.prompt,
          duration: +body.duration,
          modelName: body.model,
          imageCount: body.maxImages,
          resolution: body.resolution,
          generateAudio: false,
        }),
      },
    };
  }

  /**
   * ส่งงานให้ provider ครั้งเดียวต่อ job — retry/stalled ที่มี `providerTaskId` แล้วจะ poll ต่อ ไม่ส่งซ้ำ
   * (`dreamactorTaskId` จาก core อาจเป็นแค่ placeholder จึงใช้แยกไม่ได้)
   */
  private async submitOnce(
    job: Job,
  ): Promise<{ providerTaskId: string; submittedAt: number }> {
    const data = job.data as DreamactorProcessJob;
    const { taskId, body, userId, reqKey, sendApi, sendConfig } = data;
    if (data.providerTaskId) {
      this.logger.log(
        `Task ${taskId}: resume provider task ${data.providerTaskId} (retry/stalled) — no resubmit`,
      );
      return {
        providerTaskId: data.providerTaskId,
        submittedAt: data.submittedAt ?? Date.now(),
      };
    }
    // Backward-compat: old jobs already have dreamactorTaskId from core; new jobs need the API call.
    if (!sendApi) {
      return { providerTaskId: data.dreamactorTaskId, submittedAt: Date.now() };
    }

    // 0. Call external API (CVSync2AsyncSubmitTask) here so queue concurrency limits simultaneous API calls.
    const modelDetail = { modelType: reqKey };
    const builder = this.payloadBuilders[sendConfig?.type ?? 'dreamactor'];
    if (!builder) {
      // ไม่มี builder = config ใน master_model_type ผิด retry ไปก็ไม่หาย
      throw new UnrecoverableError(
        `Unsupported dreamactor sendConfig.type: "${sendConfig?.type}"`,
      );
    }
    const submitPayload = await builder(body, modelDetail);
    // Auth/content-type/cookie and the full action-versioned URL all come from
    // the model's DB config now (LLM gateway), so no request signing here and
    // no axios `params` (the query string is already baked into `sendApi`).
    const headers = this.buildGatewayHeaders(sendConfig);
    let apiRes: any;
    try {
      apiRes = await axios.post(sendApi, submitPayload, {
        headers,
        httpsAgent: this.agent,
      });
      await this.generateHelperService.logAudit(userId, 'CREATE', body, taskId);
    } catch (error: any) {
      // Surface the real API rejection reason. Log the verbose detail
      // (payload + response) server-side for debugging, but throw only the
      // clean message. process() owns all failure reporting (status,
      // event, credit refund, DB rows) — don't duplicate it here.
      const apiStatus = error.response?.status;
      const apiBody = error.response?.data;
      const apiMessage =
        apiBody?.error?.message ?? apiBody?.message ?? error.message;
      this.logger.error(
        `❌ Dreamactor API call failed: API ${apiStatus}: ${apiMessage} | payload=${JSON.stringify(
          submitPayload,
        )} | response=${JSON.stringify(apiBody)}`,
      );

      throw new UnrecoverableError(apiMessage);
    }
    const providerTaskId: string =
      apiRes.data?.data?.task_id ?? data.dreamactorTaskId;
    const submittedAt = Date.now();
    await this.updateTaskStatus(taskId, { dreamactorTaskId: providerTaskId });
    await job.updateData({ ...data, providerTaskId, submittedAt });
    return { providerTaskId, submittedAt };
  }

  /**
   * poll ทุก 10s จน provider ตอบ done/failed — GET ล้มชั่วคราวไม่ fail งาน
   * @throws เมื่อเกิน DREAMACTOR_POLL_TIMEOUT_MS หรือ done แต่ไม่มี video_url
   */
  private async pollUntilTerminal(
    data: DreamactorProcessJob,
    providerTaskId: string,
    submittedAt: number,
  ): Promise<
    { status: 'done'; videoUrl: string } | { status: 'failed'; message: string }
  > {
    const { taskId, clientId, body, reqKey, statusBaseUrl, sendConfig } = data;
    while (true) {
      const elapsedMs = Date.now() - submittedAt;
      if (elapsedMs > DREAMACTOR_POLL_TIMEOUT_MS) {
        this.logger.warn(
          `⏱️ Task ${taskId}: no result after ${Math.round(
            elapsedMs / 1000,
          )}s — timed out`,
        );
        throw new Error('generation timed out');
      }
      await this.publishToCore(clientId, 'worker:dreamactor-progress', {
        taskId,
        timestamp: new Date().toISOString(),
        type: 'dreamactor',
        projectId: body.projectId,
      });
      const bodyPayload = {
        req_key: reqKey,
        task_id: providerTaskId,
      };

      // `statusBaseUrl` (= taskPollApi) already carries the model/action/version
      // query string; auth + cookie come from the model's DB config.
      const headers = this.buildGatewayHeaders(sendConfig);

      let getResult: any;
      try {
        getResult = await axios.post(statusBaseUrl, bodyPayload, {
          headers: headers,
          httpsAgent: this.agent,
        });
      } catch (error) {
        this.logger.warn(
          `Task ${taskId}: status request failed — ${
            (error as Error).message
          }, retrying after 10 seconds...`,
        );
        await this.wait(DREAMACTOR_POLL_INTERVAL_MS);
        continue;
      }

      const status = getResult.data?.data?.status;
      console.log('status', status);
      if (status === 'done') {
        console.log(getResult.data);
        let videoUrl = '';
        try {
          const respData = JSON.parse(getResult.data.data.resp_data);
          videoUrl = respData.video_url;
        } catch (e) {
          console.error('Error parse resp_data', e);
        }
        if (!videoUrl) throw new Error('Provider returned no video_url');
        console.log('----- task succeeded -----');
        return { status: 'done', videoUrl };
      }
      if (status === 'failed') {
        console.log('----- task failed -----');
        this.logger.warn(
          `Task ${taskId}: provider failed response=${JSON.stringify(
            getResult.data,
          )}`,
        );
        return { status: 'failed', message: 'DreamActor generation failed' };
      }
      console.log(`Current status: ${status}, Retrying after 10 seconds...`);
      await this.wait(DREAMACTOR_POLL_INTERVAL_MS);
    }
  }

  /**
   * ปิดงานครั้งเดียวต่อ taskId (lock เดียวกันทั้ง success/fail) — กันตัด/คืนเครดิตซ้ำเมื่อ job ถูก retry/stalled
   * @returns error ที่ทำให้งานจบแบบ failed หรือ null เมื่อสำเร็จ/ปิดไปแล้ว
   */
  private async finalizeOnce(
    data: DreamactorProcessJob,
    outcome: { videoUrl: string } | { error: Error },
  ): Promise<Error | null> {
    const acquired = await this.redis.set(
      dreamactorFinalKey(data.taskId),
      '1',
      'EX',
      DREAMACTOR_FINAL_TTL_SEC,
      'NX',
    );
    if (acquired === null) {
      this.logger.log(`Task ${data.taskId} already finalized — skip`);
      return null;
    }
    const error =
      'error' in outcome
        ? outcome.error
        : await this.completeTask(data, outcome.videoUrl).then(
            () => null,
            // เก็บไฟล์/อัปเดต DB ล้มหลังได้ lock — ต้องปิดเป็น failed เอง ไม่งั้นค้าง processing
            (err: Error) => err,
          );
    if (!error) return null;
    try {
      await this.failTask(data, error);
    } catch (failError) {
      this.logger.error(
        `❌ Task ${data.taskId}: fail path itself failed — ${
          (failError as Error).message
        }`,
        (failError as Error).stack,
      );
    }
    return error;
  }

  /** success path เดิมจาก loop polling — เขียน DB ก่อนแจ้ง front ว่า upload สำเร็จ (เดิมไม่ตัดเครดิตตอนสำเร็จ — คงไว้) */
  private async completeTask(
    data: DreamactorProcessJob,
    videoUrl: string,
  ): Promise<void> {
    const { taskId, clientId, body } = data;
    await this.publishToCore(clientId, 'worker:dreamactor-url-success', {
      taskId,
      videoUrl: videoUrl,
      timestamp: new Date().toISOString(),
      type: 'dreamactor',
      projectId: body.projectId,
    });

    const result = await this.videoStorage.storeVideoWithThumbnail({
      organizationId: body.organizationId,
      projectId: body.projectId,
      typeGenerate: 'dreamactor',
      sourceUrl: videoUrl,
    });
    console.log('returngenerate');

    await this.galleryRepo.updateMany({
      where: { taskId: taskId },
      data: {
        imageUrl: result.file,
        resultUrl: [result.file],
        thumbnailUrl: result.thumbnail,
        genneratedStatus: 'SUCCESS',
        // denormalize token จริงจาก log ลง gallery (dual-write)
        tokenUsed: 0,
      },
    });
    await this.logrepo.updateMany({
      where: { taskId: taskId },
      data: { status: 'success', tokenUsed: 0 },
    });

    await this.publishToCore(clientId, 'worker:dreamactor-upload-success', {
      taskId,
      videoUrl: await this.storageUrl.resolveOutputUrl(
        body.organizationId,
        body.projectId,
        'dreamactor',
        result.file,
      ),
      thumbnailUrl: await this.storageUrl.resolveOutputUrl(
        body.organizationId,
        body.projectId,
        'dreamactor',
        result.thumbnail,
      ),
      timestamp: new Date().toISOString(),
      type: 'dreamactor',
      projectId: body.projectId,
    });

    // 4. อัพเดทสถานะเป็น completed
    await this.updateTaskStatus(taskId, {
      status: 'completed',
      completedAt: new Date().toISOString(),
    });

    // 5. ส่ง event "complete" ไปยัง Core Service
    await this.publishToCore(clientId, 'worker:dreamactor-complete', {
      taskId,
      success: true,
      timestamp: new Date().toISOString(),
      type: 'dreamactor',
      projectId: body.projectId,
    });
  }

  /** fail path เดียว (provider failed / timeout / throw) — สถานะ failed, แจ้ง front, คืนเครดิต, gallery FAILED */
  private async failTask(data: DreamactorProcessJob, error: Error) {
    const { taskId, clientId, body, userId } = data;
    await this.generateHelperService.logError(
      userId,
      error.message,
      error.stack,
      body,
    );

    // อัพเดทสถานะเป็น failed
    await this.updateTaskStatus(taskId, {
      status: 'failed',
      failedAt: new Date().toISOString(),
      error: error.message,
    });

    // ส่ง error event ไปยัง Core Service
    await this.publishToCore(clientId, 'worker:dreamactor-error', {
      taskId,
      error: error.message,
      timestamp: new Date().toISOString(),
      type: 'dreamactor',
      projectId: body.projectId,
      message: error.message,
    });

    // บันทึก error log
    await this.logrepo.updateMany({
      where: { taskId },
      data: {
        status: 'failed',
      },
    });
    const failedLog = await this.logrepo.findOne({
      where: { taskId },
    });
    if (failedLog) {
      const updated = await this.generateHelperService.updateUsedCreditFail(
        userId,
        body.organizationId,
        body.projectId,
        'credit',
        failedLog.usedCredit,
      );
      const usedCredit =
        updated.usedCreditAllowance + updated.holdCreditAllowance;
      await this.redis.set(
        this.creditCacheKey(data),
        usedCredit.toString(),
        'EX',
        60 * 60,
      );
    } else {
      this.logger.warn(`Task ${taskId}: no log row — credit not refunded`);
    }
    await this.galleryRepo.updateMany({
      where: { taskId },
      data: {
        genneratedStatus: 'FAILED',
      },
    });
  }

  private creditCacheKey(data: DreamactorProcessJob): string {
    return `${data.body.organizationId}/${data.body.projectId}/credit_used_${data.userId}`;
  }

  /** แยกไว้ให้ test ข้ามการรอได้ */
  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
    } catch (error: any) {
      this.logger.error(`Failed to publish event: ${error.message}`);
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

  private buildGenerateConfig(body: {
    ratio: string;
    width: number;
    height: number;
    prompt: string;
    duration: number;
    modelName: string;
    imageCount: number;
    resolution: string;
    generateAudio: boolean;
  }) {
    return {
      ...(body?.width && { width: body?.width }),
      ...(body?.height && { height: body?.height }),
      ...(body?.ratio && { ratio: body?.ratio }),
      ...(body?.imageCount && { imageCount: body?.imageCount }),
      ...(body?.resolution && { resolution: body?.resolution }),
      ...(body?.modelName && { modelName: body?.modelName }),
      ...(body?.duration && { duration: body?.duration }),
      content: body?.prompt,
      ...(body?.generateAudio && { generateAudio: body?.generateAudio }),
    };
  }

  /**
   * Build LLM-gateway request headers from the model's `sendConfig`.
   *
   * The gateway auth token (`authorization`, already including the `Bearer `
   * prefix), the content type (`configType`), and an optional WAF `cookie` are
   * all stored per-model in the DB. The `Authorization`/`Cookie` headers are only
   * added when present so a config without them still yields a valid request.
   *
   * @param sendConfig - The model's `sendConfig` JSON (free-form) from master data.
   * @returns Header map for the gateway submit/poll requests.
   */
  private buildGatewayHeaders(sendConfig?: {
    [k: string]: unknown;
  }): Record<string, string> {
    const authorization =
      typeof sendConfig?.authorization === 'string'
        ? sendConfig.authorization
        : undefined;
    const cookie =
      typeof sendConfig?.cookie === 'string' ? sendConfig.cookie : undefined;
    const contentType =
      typeof sendConfig?.configType === 'string'
        ? sendConfig.configType
        : 'application/json';
    return {
      'Content-Type': contentType,
      ...(authorization && { Authorization: authorization }),
      ...(cookie && { Cookie: cookie }),
    };
  }

  // แยก builder แต่ละ model เป็น private method
  private readonly payloadBuilders: Record<
    string,
    (body: RequestDreamactorGenerateDto, modelDetail: any) => any
  > = {
    dreamactor: this.buildDreamacterPayload.bind(this),
  };

  private async buildDreamacterPayload(
    body: RequestDreamactorGenerateDto,
    modelDetail: any,
  ) {
    return {
      req_key: modelDetail.modelType || 'dreamactor_m20_gen_video_cvtob',
      // toProviderUrl มี guard ในตัว: reference ที่เป็น URL อยู่แล้ว (จาก workflow)
      // ส่งต่อตรง ๆ ไม่ presign ซ้ำ — เดิม presign ทุกค่าจนได้ URL ที่ใช้ไม่ได้
      image_urls: await this.storageUrl.toProviderUrls([body.image[0]]),
      video_url: await this.storageUrl.toProviderUrl(body.image[1]),
    };
  }

  async onModuleDestroy() {
    await this.redisPublisher.quit();
  }
}
