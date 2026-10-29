/** Extract a value from a nested object using a dot-notation path (e.g. "data.task_id") */
function getByPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce((cur: any, key) => cur?.[key], obj);
}

import {
  InjectQueue,
  Processor,
  WorkerHost,
  OnWorkerEvent,
} from '@nestjs/bullmq';
import { Job, Queue, UnrecoverableError } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import axios, { AxiosRequestConfig } from 'axios';
import * as https from 'https';
import * as path from 'path';
import {
  RequestImageGenerateDto,
  GalleryRepository,
  LogRepository,
  QUEUE_NAME_IMAGE,
  IMAGE_JOB_SWEEP,
  LIVE_JOB_STATES,
  MAX_CONCURRENT_TASKS_PER_TYPE,
  RefImageRepository,
  StorageUrlService,
  TosService,
  buildOutputKey,
  isAbsoluteUrl,
  ProjectRepository,
  ProjectMemberRepository,
  CreditBalanceRepository,
  MasterdataModelTypeRepository,
  MasterModelTypeDto,
  describeTosError,
  TraceJob,
  TRACE_CARRIER_KEY,
  injectTraceContext,
} from '@ai-media/share';
import { Span } from 'nestjs-otel';
import { Prisma } from '@prisma/client';
import { tosConfigs } from 'src/configs';
import { GenerateHelperService } from './generate-helper.service';
import { userFacingMessage } from './user-facing-error';

/** sweeper รอบละ 10 นาที — ปิด gallery PENDING ที่เกิน 30 นาทีแล้ว job ไม่อยู่ในคิว (pod ตาย / stalled) */
const IMAGE_SWEEP_EVERY_MS = 10 * 60 * 1000;
const IMAGE_SWEEP_STALE_MS = 30 * 60 * 1000;
const SEEDREAM2_MAX_REF_IMAGES = 10;

interface TaskResponseMap {
  taskIdPath: string;
  statusPath: string;
  doneValue: string;
  resultPath: string;
}

interface ImageProcessJob {
  taskId: string;
  clientId: string;
  body: RequestImageGenerateDto;
  userId: string;
  // Fields forwarded from modelDetail so the worker can call the API itself
  sendApi: string;
  sendConfig: {
    type: string;
    configType: string;
    authorization: string;
    stream?: boolean;
    watermark?: boolean;
    [k: string]: unknown;
  };
  taskPollApi?: string | null;
  taskPollSec?: number;
  taskResponseMap?: TaskResponseMap | null;
}

@Injectable()
@Processor(QUEUE_NAME_IMAGE, { concurrency: MAX_CONCURRENT_TASKS_PER_TYPE })
export class ImageProcessor extends WorkerHost {
  private readonly logger = new Logger(ImageProcessor.name);
  private agent: https.Agent;
  private redisPublisher: Redis;

  constructor(
    @InjectRedis() private readonly redis: Redis,
    private readonly galleryRepo: GalleryRepository,
    private readonly logrepo: LogRepository,
    private readonly refImageRepository: RefImageRepository,
    private readonly tosService: TosService,
    private readonly storageUrl: StorageUrlService,
    private readonly creditBalanceRepo: CreditBalanceRepository,
    private readonly projectRepo: ProjectRepository,
    private readonly projectMemberRepo: ProjectMemberRepository,
    private readonly generateHelperService: GenerateHelperService,
    private readonly masterModelTypeRepo: MasterdataModelTypeRepository,
    @InjectQueue(QUEUE_NAME_IMAGE) private readonly imageQueue: Queue,
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

  @TraceJob()
  async process(job: any): Promise<any> {
    if (job.name === IMAGE_JOB_SWEEP) return this.handleSweep();
    const { taskId, clientId, body, userId, sendApi, sendConfig } =
      job.data as ImageProcessJob;
    // Per-org LLM gateway key set by the producer (falls back to the model token).
    const authorization: string | null =
      (job.data as any).authorization ?? sendConfig?.authorization ?? null;

    this.logger.log(`👨‍🍳 Processing job: ${job.id}, Task: ${taskId}`);
    const redisImageCacheKey = `${body.organizationId}/${body.projectId}/credit_used_${userId}`;

    try {
      const uploadedImages: string[] = [];
      const bytepluseUrl = [];
      const model = await this.masterModelTypeRepo.findOne({
        where: { modelType: body.model, isActive: true },
      });
      const credit = await this.generateHelperService.getUsedCredit(
        0,
        body,
        model,
      );

      // 0. Call the external API here so queue concurrency limits simultaneous API calls.
      // Backward-compat: if old core put dataImage in job data, use it directly.
      let dataImage: { url: string; size: string }[];
      let usage: {
        generated_images?: number;
        output_tokens?: number;
        total_tokens?: number;
      };
      if ((job.data as any).dataImage?.length > 0) {
        dataImage = (job.data as any).dataImage;
        usage = (job.data as any).usage ?? {};
      } else {
        const axiosConfig: AxiosRequestConfig = {
          headers: {
            'Content-Type': sendConfig.configType,
            Authorization: `Bearer ${authorization}`,
          },
          httpsAgent: this.agent,
        };

        // const refImages = body.image?.length
        //   ? await Promise.all(
        //       body.image.map((img) =>
        //         this.tosService.getPreSignedUrl(tosConfigs().tosBucket, img),
        //       ),
        //     )
        //   : null;

        const payload = await this.buildPayload(body, sendConfig);
        // ไม่ log axiosConfig — headers มี Authorization ของ LLM gateway
        console.log('API Payload:', sendApi, payload);
        // provider ตอบแบบ sync (นานสุดของงาน) — แจ้ง front ว่าพ้นคิวแล้ว กำลังสร้าง
        await this.publishToCore(clientId, 'worker:progress', {
          taskId,
          stage: 'generating',
          percentage: 15,
          projectId: body.projectId,
          type: 'image',
        });
        let apiRes: any;
        try {
          apiRes = await axios.post(sendApi, payload, axiosConfig);
          console.log('API Response:', apiRes.data);
          if (apiRes) {
            await this.generateHelperService.logAudit(
              userId,
              'CREATE',
              body,
              taskId,
            );
          }
        } catch (error: any) {
          // Surface the real API rejection reason. Log the verbose detail
          // (payload + response) server-side for debugging, but throw only the
          // clean message. The outer catch owns all failure reporting (error
          // event, task status, credit refund, DB rows) — don't duplicate it here.
          const apiStatus = error.response?.status;
          const apiBody = error.response?.data;
          const apiMessage =
            apiBody?.error?.message ?? apiBody?.message ?? error.message;
          this.logger.error(
            `❌ Image API call failed: API ${apiStatus}: ${apiMessage} | payload=${JSON.stringify(
              payload,
            )} | response=${JSON.stringify(apiBody)}`,
          );

          throw new UnrecoverableError(apiMessage);
        }

        dataImage = apiRes.data.data;
        usage = apiRes.data.usage ?? {};

        // Patch totalImages into Redis now that the API has responded
        await this.updateTaskStatus(taskId, { totalImages: dataImage.length });
      }

      const totalImages = dataImage.length;

      // 1. ส่ง event "started" ไปยัง Core Service
      await this.publishToCore(clientId, 'worker:started', {
        taskId,
        totalImages,
        timestamp: new Date().toISOString(),
        projectId: body.projectId,
        type: 'image',
      });

      // อัพเดทสถานะใน Redis
      await this.updateTaskStatus(taskId, {
        status: 'processing',
        startedAt: new Date().toISOString(),
      });

      // 2. ประมวลผลทีละรูป
      for (let index = 0; index < dataImage.length; index++) {
        const imageData = dataImage[index];
        bytepluseUrl.push(imageData.url);
        this.logger.log(
          `📥 Downloading image ${index + 1}/${totalImages}: ${imageData.url}`,
        );

        // ส่ง progress: downloading
        await this.publishToCore(clientId, 'worker:progress', {
          taskId,
          stage: 'downloading',
          current: index + 1,
          total: totalImages,
          percentage: Math.round(30 + (index / totalImages) * 50),
          projectId: body.projectId,
          type: 'image',
        });

        const objectName = `${uuidv4()}.jpg`;
        const bucketname = tosConfigs().tosBucket;
        const imagePath = buildOutputKey(
          body.organizationId,
          body.projectId,
          'image',
          objectName,
        );
        await this.storeOutputImage(
          bucketname,
          imagePath,
          imageData.url,
          `${index + 1}/${totalImages}`,
        );

        // ส่ง progress: uploading
        await this.publishToCore(clientId, 'worker:progress', {
          taskId,
          stage: 'uploading',
          current: index + 1,
          total: totalImages,
          percentage: Math.round(30 + ((index + 0.5) / totalImages) * 50),
          projectId: body.projectId,
          type: 'image',
        });

        uploadedImages.push(objectName);

        // อัพเดท job progress
        await job.updateProgress({
          stage: 'processing',
          total: totalImages,
          processed: index + 1,
          percentage: Math.round(30 + ((index + 1) / totalImages) * 50),
        });

        this.logger.log(`✅ Finished image ${index + 1}/${totalImages}`);
        //event แต่ละรูปที่เสร็จ
        await this.publishToCore(clientId, 'worker:image-complete', {
          taskId,
          imageUrl: bytepluseUrl,
          index: index + 1,
          total: totalImages,
          projectId: body.projectId,
          type: 'image',
        });
      }

      // Save to Gallery — 1 record ต่อ 1 generation, เก็บ object name ทุกรูปใน resultUrl[]
      // imageUrl เก็บรูปแรกไว้เพื่อ backward-compat กับ reader ที่ยังอ่าน imageUrl
      const galleryId = await this.saveGallery({
        taskId,
        projectId: body.projectId,
        userId,
        prompt: body.prompt,
        imageUrl: uploadedImages[0] ?? '',
        resultUrl: uploadedImages,
        typeGenerate: 'image',
        genneratedStatus: 'SUCCESS',
        status: false,
        usedCredit: credit.credit,
        // denormalize metadata จาก log ลง gallery (dual-write)
        usedImage: usage.generated_images || 0,
        tokenUsed: usage.total_tokens || 0,
        ImageUsed: usage.generated_images || 0,
        resolution: body.resolution,
        ratio: body.ratio,
        generateAudio: false,
        referenceImages: body.image.length > 0 ? body.image : [],
        generateConfig: this.buildGenerateConfig({
          ratio: body.ratio,
          width: body.width,
          height: body.height,
          prompt: body.prompt,
          duration: 0,
          modelName: body.model,
          imageCount: body.maxImages,
          resolution: body.resolution,
          generateAudio: false,
        }),
      });

      // ส่
      // 3. Save Log
      const imagelog = await this.logrepo.create({
        data: {
          taskId,
          projectId: body.projectId,
          userId,
          prompt: body.prompt,
          typeGenerate: 'image',
          status: 'success',
          resolution: body.resolution,
          ratio: body.ratio,
          generateAudio: false,
          tokenUsed: usage.total_tokens || 0,
          ImageUsed: usage.generated_images || 0,
          referenceImages: body.image.length > 0 ? body.image : [],
          usedImage: usage.generated_images || 0,
          usedCredit: credit.credit,
          generateConfig: this.buildGenerateConfig({
            ratio: body.ratio,
            width: body.width,
            height: body.height,
            prompt: body.prompt,
            duration: 0,
            modelName: body.model,
            imageCount: body.maxImages,
            resolution: body.resolution,
            generateAudio: false,
          }),
        },
      });
      if (imagelog) {
        const updated =
          await this.generateHelperService.updateUsedCreditSuccess(
            taskId,
            userId,
            body.organizationId,
            body.projectId,
            'credit',
            credit.credit,
          );
        const usedCredit =
          updated.usedCreditAllowance + updated.holdCreditAllowance;
        await this.redis.set(
          redisImageCacheKey,
          usedCredit.toString(),
          'EX',
          60 * 60,
        );
      }
      // 4. อัพเดทสถานะเป็น completed
      await this.updateTaskStatus(taskId, {
        status: 'completed',
        completedAt: new Date().toISOString(),
        imageCount: uploadedImages.length,
        images: uploadedImages,
      });

      // 5. ส่ง event "complete" ไปยัง Core Service
      await this.publishToCore(clientId, 'worker:image-complete', {
        taskId,
        // front ใช้ download — ไม่มี id จะเอา URL provider ไปเรียกแล้วได้ 404
        galleryId,
        success: true,
        imageCount: uploadedImages.length,
        images: uploadedImages,
        timestamp: new Date().toISOString(),
        projectId: body.projectId,
        type: 'image',
        data: {
          projectId: body.projectId,
          userId,
          prompt: body.prompt,
          imageUrl: bytepluseUrl,
          resultUrl: uploadedImages,
          typeGenerate: 'image',
          genneratedStatus: 'SUCCESS',
          status: true,
          generateConfig: this.buildGenerateConfig({
            ratio: body.ratio,
            width: body.width,
            height: body.height,
            prompt: body.prompt,
            duration: 0,
            modelName: body.model,
            imageCount: body.maxImages,
            resolution: body.resolution,
            generateAudio: false,
          }),
        },
      });
      if (body.image.length > 0) {
        await Promise.all(
          body.image
            // ข้าม reference ที่เป็น URL (เช่น output ของ workflow ที่ presign ตั้งแต่ submit)
            // เพราะไม่มี refImage record และจะทำให้ update พังด้วย "Record not found"
            .filter((image) => !isAbsoluteUrl(image))
            .map((image) => {
              const imageName = path.parse(image).name;
              // ใช้ updateMany เพื่อไม่ throw ถ้าไม่พบ record (กัน worker crash)
              return this.refImageRepository
                .updateMany({
                  where: { uid: imageName },
                  data: { status: 'completed' },
                })
                .catch((err) =>
                  this.logger.warn(
                    `refImage update skipped (${imageName}): ${err?.message}`,
                  ),
                );
            }),
        );
      }

      this.logger.log(
        `🎉 Job ${job.id} completed! Processed ${uploadedImages.length} images`,
      );

      return {
        success: true,
        taskId,
        imageCount: uploadedImages.length,
        images: uploadedImages,
        data: {
          projectId: body.projectId,
          userId,
          prompt: body.prompt,
          imageUrl: bytepluseUrl,
          resultUrl: uploadedImages,
          typeGenerate: 'image',
          genneratedStatus: 'SUCCESS',
          status: true,
          generateConfig: this.buildGenerateConfig({
            ratio: body.ratio,
            width: body.width,
            height: body.height,
            prompt: body.prompt,
            duration: 0,
            modelName: body.model,
            imageCount: body.maxImages,
            resolution: body.resolution,
            generateAudio: false,
          }),
        },
      };
    } catch (error: any) {
      await this.generateHelperService.logError(
        'GenerateImageService',
        userId,
        error.message,
        error.stack,
        body,
      );

      this.logger.error(
        `❌ Job ${job.id} failed: ${(error as Error).message}`,
        error.stack,
      );

      // อัพเดทสถานะเป็น failed
      await this.updateTaskStatus(taskId, {
        status: 'failed',
        failedAt: new Date().toISOString(),
        error: userFacingMessage(error),
      });
      // a retry may still succeed and charge — refunding now would make it free
      const isFinalAttempt =
        error instanceof UnrecoverableError ||
        job.attemptsMade + 1 >= (job.opts?.attempts ?? 1);
      if (isFinalAttempt) {
        const creditForFailure = await this.generateHelperService.getUsedCredit(
          0,
          body,
          await this.masterModelTypeRepo.findOne({
            where: { modelType: body.model, isActive: true },
          }),
        );
        await this.generateHelperService.updateUsedCreditFail(
          taskId,
          userId,
          body.organizationId,
          body.projectId,
          'credit',
          creditForFailure?.credit ?? 0,
        );
      }
      // ส่ง error event ไปยัง Core Service
      await this.publishToCore(clientId, 'worker:image-error', {
        taskId,
        error: userFacingMessage(error),
        timestamp: new Date().toISOString(),
        projectId: body.projectId,
        type: 'image',
        message: userFacingMessage(error),
      });
      await this.saveGallery({
        taskId,
        projectId: body.projectId,
        userId,
        prompt: body.prompt,
        imageUrl: '',
        resultUrl: [],
        typeGenerate: 'image',
        genneratedStatus: 'FAILED',
        status: false,
        // denormalize metadata จาก log ลง gallery (dual-write)
        tokenUsed: 0,
        ImageUsed: 0,
        resolution: body.resolution,
        ratio: body.ratio,
        generateAudio: false,
        referenceImages: body.image.length > 0 ? body.image : [],
        generateConfig: this.buildGenerateConfig({
          ratio: body.ratio,
          width: body.width,
          height: body.height,
          prompt: body.prompt,
          duration: 0,
          modelName: body.model,
          imageCount: body.maxImages,
          resolution: body.resolution,
          generateAudio: false,
        }),
      });
      // บันทึก error log
      await this.logrepo.create({
        data: {
          taskId,
          projectId: body.projectId,
          userId,
          prompt: body.prompt,
          typeGenerate: 'image',
          status: 'failed',
          resolution: body.resolution,
          ratio: body.ratio,
          generateAudio: false,
          tokenUsed: 0,
          ImageUsed: 0,
          referenceImages: body.image.length > 0 ? body.image : [],
          generateConfig: this.buildGenerateConfig({
            ratio: body.ratio,
            width: body.width,
            height: body.height,
            prompt: body.prompt,
            duration: 0,
            modelName: body.model,
            imageCount: body.maxImages,
            resolution: body.resolution,
            generateAudio: false,
          }),
        },
      });

      throw error;
    }
  }

  /**
   * เก็บรูปผลลัพธ์ลง TOS: ให้ TOS ดึงจาก URL ของ provider เอง (`fetchObject`) — ล้ม = throw ให้งาน fail
   */
  @Span()
  private async storeOutputImage(
    bucket: string,
    key: string,
    sourceUrl: string,
    label: string,
  ): Promise<void> {
    const startedAt = Date.now();
    try {
      await this.tosService.fetchObject(bucket, key, sourceUrl);
    } catch (error) {
      this.logger.error(
        `❌ [fetchObject] image ${label} failed after ${
          Date.now() - startedAt
        }ms — ${describeTosError(error)}`,
      );
      throw error;
    }
    this.logger.log(
      `🚀 [fetchObject] image ${label} stored by TOS directly (${
        Date.now() - startedAt
      }ms) → ${key}`,
    );
  }

  /**
   * ส่ง event ไปยัง Core Service ผ่าน Redis Pub/Sub
   */

  @Span()
  private async publishToCore(clientId: string, event: string, payload: any) {
    // Use the last segment so 'worker:generate:error' → channel 'worker:error' (not 'worker:generate')
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
          // core ต่อ trace จากตรงนี้ (WebsocketGateway.onWorkerMessage)
          [TRACE_CARRIER_KEY]: injectTraceContext(),
        }),
      );
    } catch (error: any) {
      this.logger.error(`Failed to publish event: ${error.message}`);
    }
  }

  /**
   * เขียนผลลง gallery row PENDING ที่ core สร้างตอน submit (update ซ้ำได้ ไม่เกิด row ซ้ำตอน retry)
   * ไม่เจอ row = job เข้าคิวก่อน core เริ่มสร้าง PENDING → create แทน
   * @returns gallery id ของ row ที่เขียน
   */
  @Span()
  private async saveGallery(
    data: Prisma.GalleryUncheckedCreateInput,
  ): Promise<string | undefined> {
    const { count } = await this.galleryRepo.updateMany({
      where: { taskId: data.taskId },
      data,
    });
    if (count > 0) {
      const row = await this.galleryRepo.findOne({
        where: { taskId: data.taskId },
      });
      return row?.id;
    }
    this.logger.warn(
      `⚠️ No PENDING gallery row for task ${data.taskId} — creating one`,
    );
    const created = await this.galleryRepo.create({ data });
    return created.id;
  }

  /**
   * อัพเดทสถานะของ task ใน Redis
   */
  @Span()
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

  /** ทุก 10 นาที: ปิด gallery PENDING ที่ไม่มี job ไหนจะปิดให้ (FAILED + คืน hold + แจ้ง user) */
  @Span()
  private async handleSweep(): Promise<unknown> {
    const rows = await this.galleryRepo.findMany({
      where: {
        typeGenerate: 'image',
        genneratedStatus: 'PENDING',
        taskId: { not: null },
        createdAt: { lt: new Date(Date.now() - IMAGE_SWEEP_STALE_MS) },
      },
      select: { taskId: true, userId: true, projectId: true, usedCredit: true },
    });
    if (rows.length === 0) return { checked: 0 };

    const counts = { alive: 0, cleared: 0, failed: 0, error: 0 };
    for (const row of rows) {
      try {
        counts[await this.sweepOne(row)] += 1;
      } catch (error) {
        counts.error += 1;
        this.logger.error(
          `🧹 image sweep failed task=${row.taskId}: ${
            (error as Error).message
          }`,
        );
      }
    }
    this.logger.log(
      `🧹 image sweep checked=${rows.length} ${JSON.stringify(counts)}`,
    );
    return { checked: rows.length, ...counts };
  }

  @Span()
  private async sweepOne(row: {
    taskId: string | null;
    userId: string;
    projectId: string;
    usedCredit: number | null;
  }): Promise<'alive' | 'cleared' | 'failed'> {
    const taskId = row.taskId as string; // query กรอง taskId not null แล้ว
    // job ยังรอคิว / กำลังวิ่ง — คิวช้า ไม่ใช่งานค้าง
    const job = await this.imageQueue.getJob(taskId);
    const state = job ? await job.getState() : null;
    if (state && LIVE_JOB_STATES.includes(state)) return 'alive';

    // claim ด้วยเงื่อนไข PENDING — ทางอื่นปิดไปก่อน (count=0) ต้องไม่คืนเครดิตซ้ำ
    const { count } = await this.galleryRepo.updateMany({
      where: { taskId, genneratedStatus: 'PENDING' },
      data: { genneratedStatus: 'FAILED' },
    });
    if (count === 0) return 'cleared';

    this.logger.warn(
      `🧹 task=${taskId} stale (job state=${
        state ?? 'missing'
      }) — closing as failed, refund=${row.usedCredit ?? 0}`,
    );
    await this.generateHelperService.updateUsedCreditFail(
      taskId,
      row.userId,
      '',
      row.projectId,
      'credit',
      row.usedCredit ?? 0,
    );
    await this.updateTaskStatus(taskId, {
      status: 'failed',
      failedAt: new Date().toISOString(),
      error: 'stale',
    });
    const message = 'Image generation did not complete. Please try again.';
    await this.publishToCore(
      (job?.data as ImageProcessJob | undefined)?.clientId ?? '',
      'worker:image-error',
      {
        taskId,
        error: message,
        timestamp: new Date().toISOString(),
        projectId: row.projectId,
        type: 'image',
        message,
      },
    );
    return 'failed';
  }

  async onModuleInit() {
    // upsert ด้วย id คงที่ — ทุก pod เรียกได้ ได้ scheduler ตัวเดียว
    await this.imageQueue.upsertJobScheduler(
      'image-sweep-scheduler',
      { every: IMAGE_SWEEP_EVERY_MS },
      {
        name: IMAGE_JOB_SWEEP,
        data: {},
        opts: { removeOnComplete: { count: 10 }, removeOnFail: { count: 10 } },
      },
    );
  }

  async onModuleDestroy() {
    await this.redisPublisher.quit();
  }

  // map ชื่อ model (prefix) → payload builder function
  @Span()
  private async buildPayload(body: RequestImageGenerateDto, sendConfig: any) {
    const builder = this.payloadBuilders[sendConfig?.type];
    if (!builder) {
      // ไม่มี builder = config ใน master_model_type ผิด retry ไปก็ไม่หาย
      throw new UnrecoverableError(
        `Unsupported image sendConfig.type: "${sendConfig?.type}"`,
      );
    }
    return builder(body, sendConfig);
  }
  private readonly payloadBuilders: Record<
    string,
    (body: RequestImageGenerateDto, modelDetail: any) => Promise<any>
  > = {
    seedream1: this.buildSeedream1Payload.bind(this),
    seedream2: this.buildSeedream2Payload.bind(this),
  };

  private async buildSeedream1Payload(
    body: RequestImageGenerateDto,
    modelDetail: any,
  ) {
    Logger.debug(
      `Building payload for seedream1 with body: ${JSON.stringify(body)}`,
    );
    // toProviderUrl มี guard ในตัว: ค่าที่เป็น URL อยู่แล้ว (reference จาก workflow)
    // ส่งต่อตรง ๆ ส่วน object key จึงค่อย presign — และ throw ถ้า presign ไม่ผ่าน
    const refKeys = (body.image ?? []).filter((ref): ref is string =>
      Boolean(ref),
    );
    const images = refKeys.length
      ? await this.storageUrl.toProviderUrls(refKeys)
      : null;
    return {
      model: body.model,
      prompt:
        body.maxImages > 1
          ? `create ${body.maxImages} images ${body.prompt}`
          : body.prompt,
      response_format: 'url',
      ratio: body.ratio,
      size: `${body.width}x${body.height}`,
      stream: modelDetail.sendConfig?.stream ?? false,
      watermark: modelDetail.sendConfig?.watermark ?? false,
      sequential_image_generation: body.sequentialImageGeneration,
      ...(images && images.length > 0 && { image: images }),
      ...(body.maxImages && {
        sequential_image_generation_options: { max_images: body.maxImages },
      }),
    };
  }

  // Seedream 5.0 Pro: provider ตอบ 400 ถ้ามี sequential_image_generation (แม้ "disabled") หรือ stream
  // และสร้างได้ครั้งละ 1 รูป จึงไม่ส่ง field กลุ่มนั้นเลย
  private async buildSeedream2Payload(
    body: RequestImageGenerateDto,
    modelDetail: any,
  ) {
    Logger.debug(
      `Building payload for seedream2 with body: ${JSON.stringify(body)}`,
    );
    // Pro รับ reference ได้สูงสุด 10 รูป ส่วนเกินตัดทิ้งเงียบ ๆ แทน throw
    const refKeys = (body.image ?? [])
      .filter((ref): ref is string => Boolean(ref))
      .slice(0, SEEDREAM2_MAX_REF_IMAGES);
    const images = refKeys.length
      ? await this.storageUrl.toProviderUrls(refKeys)
      : null;
    return {
      model: body.model,
      prompt: body.prompt,
      response_format: 'url',
      size: `${body.width}x${body.height}`,
      // พารามิเตอร์นี้คือ sendConfig อยู่แล้ว (ไม่ใช่ modelDetail ที่ห่อ sendConfig)
      watermark: modelDetail?.watermark ?? false,
      ...(images && images.length > 0 && { image: images }),
    };
  }
}
