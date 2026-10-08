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

  async process(job: any, token?: string): Promise<any> {
    const {
      taskId,
      clientId,
      body,
      userId,
      reqKey,
      statusBaseUrl,
      sendApi,
      sendConfig,
    } = job.data as DreamactorProcessJob;
    console.log(`taskId`, taskId, clientId, body, userId);

    this.logger.log(`👨‍🍳 Processing job: ${job.id}, Task: ${taskId}`);
    const redisVideoCacheKey = `${body.organizationId}/${body.projectId}/credit_used_${userId}`;

    try {
      // 0. Call external API (CVSync2AsyncSubmitTask) here so queue concurrency limits simultaneous API calls.
      // Backward-compat: old jobs already have dreamactorTaskId from core; new jobs need the API call.
      let dreamactorTaskId: string = (job.data as DreamactorProcessJob)
        .dreamactorTaskId;
      if (sendApi) {
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
          await this.generateHelperService.logAudit(
            userId,
            'CREATE',
            body,
            taskId,
          );
        } catch (error: any) {
          // Surface the real API rejection reason. Log the verbose detail
          // (payload + response) server-side for debugging, but throw only the
          // clean message. The outer catch owns all failure reporting (status,
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
        dreamactorTaskId = apiRes.data?.data?.task_id ?? dreamactorTaskId;
        await this.updateTaskStatus(taskId, { dreamactorTaskId });
      }

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
      const sleep = (ms: number) =>
        new Promise((resolve) => setTimeout(resolve, ms));

      while (true) {
        await this.publishToCore(clientId, 'worker:dreamactor-progress', {
          taskId,
          timestamp: new Date().toISOString(),
          type: 'dreamactor',
          projectId: body.projectId,
        });
        const url = statusBaseUrl;
        const bodyPayload = {
          req_key: reqKey,
          task_id: dreamactorTaskId,
        };

        // `statusBaseUrl` (= taskPollApi) already carries the model/action/version
        // query string; auth + cookie come from the model's DB config.
        const headers = this.buildGatewayHeaders(sendConfig);

        const getResult = await axios.post(url, bodyPayload, {
          headers: headers,
          httpsAgent: this.agent,
        });

        // mockdata
        // const getResult = {
        //     data: {
        //         id: "cgt-2025******-****",
        //         model: "seedance-1-5-pro-251215",
        //         status: "succeeded",
        //         content: {
        //             video_url: "https://www.aicave.ai/public/api/v1/s3/ai-media-image-vdo/cgt-20260202111751-ncbdf/1770002305718-f543977d-b0e8-456e-b3d1-22b48810efe0.mp4?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=LB7kAwp1rgI1g4d3h0Wa%2F20260203%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20260203T032016Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host&X-Amz-Signature=c08d0cda185e086ed197d71c6b76922e62f0b349fa7bf8b2b4cb9069a298e626"
        //         },
        //         usage: {
        //             completion_tokens: 108900,
        //             total_tokens: 108900
        //         },
        //         created_at: 1743414619,
        //         updated_at: 1743414673,
        //         seed: 10,
        //         resolution: "720p",
        //         ratio: "16:9",
        //         duration: 5,
        //         framespersecond: 24,
        //         service_tier: "default",
        //         execution_expires_after: 172800,
        //         generate_audio: true,
        //         draft: false
        //     }
        // }
        const status = getResult.data.data.status;
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

          console.log('----- task succeeded -----');
          await this.publishToCore(clientId, 'worker:dreamactor-url-success', {
            taskId,
            videoUrl: videoUrl,
            timestamp: new Date().toISOString(),
            type: 'dreamactor',
            projectId: body.projectId,
          });
          // const redisVideoCacheKey = `${body.organizationId}/${body.projectId}/dreamactor${body.userId}`;
          const result = await this.videoStorage.storeVideoWithThumbnail({
            organizationId: body.organizationId,
            projectId: body.projectId,
            typeGenerate: 'dreamactor',
            sourceUrl: videoUrl,
          });

          await this.publishToCore(
            clientId,
            'worker:dreamactor-upload-success',
            {
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
            },
          );
          // await this.redis.set(
          //   redisVideoCacheKey,
          //   usage.total_tokens.toString(),
          //   'EX',
          //   24 * 60 * 60,
          // );
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
          break;
        } else if (status === 'failed') {
          console.log('----- task failed -----');
          await this.logrepo.updateMany({
            where: { taskId },
            data: {
              status: 'failed',
            },
          });
          const failedLog = await this.logrepo.findOne({
            where: { taskId },
          });
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
            redisVideoCacheKey,
            usedCredit.toString(),
            'EX',
            60 * 60,
          );
          break;
        } else {
          console.log(
            `Current status: ${status}, Retrying after 10 seconds...`,
          );
          await sleep(10_000);
        }
      }

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
    } catch (error: any) {
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
      await this.galleryRepo.updateMany({
        where: { taskId },
        data: {
          genneratedStatus: 'FAILED',
        },
      });

      const failedLog = await this.logrepo.findOne({
        where: { taskId },
      });
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
        redisVideoCacheKey,
        usedCredit.toString(),
        'EX',
        60 * 60,
      );
      throw error; // Stop retrying by not throwing error
    }
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
