/** Extract a value from a nested object using a dot-notation path (e.g. "data.task_id") */
function getByPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce((cur: any, key) => cur?.[key], obj);
}

import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';
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
  MAX_CONCURRENT_TASKS_PER_TYPE,
  RefImageRepository,
  TosService,
  ProjectRepository,
  ProjectMemberRepository,
  CreditBalanceRepository,
  MasterdataModelTypeRepository,
  MasterModelTypeDto,
} from '@ai-media/share';
import { tosConfigs } from 'src/configs';
import { GenerateHelperService } from './generate-helper.service';

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
    private readonly creditBalanceRepo: CreditBalanceRepository,
    private readonly projectRepo: ProjectRepository,
    private readonly projectMemberRepo: ProjectMemberRepository,
    private readonly generateHelperService: GenerateHelperService,
    private readonly masterModelTypeRepo: MasterdataModelTypeRepository,
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

  async process(job: any): Promise<any> {
    //
    const { taskId, clientId, body, userId, sendApi, sendConfig } =
      job.data as ImageProcessJob;

    this.logger.log(`👨‍🍳 Processing job: ${job.id}, Task: ${taskId}`);
    const redisImageCacheKey = `${body.organizationId}/${body.projectId}/credit_used_${userId}`;

    try {
      const uploadedImages: string[] = [];
      const bytepluseUrl = [];
      const model = await this.masterModelTypeRepo.findOne({
        where: { modelType: body.model },
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
            Authorization: `${sendConfig.authorization}`,
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
        console.log('API Payload:', sendApi, payload, axiosConfig);
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

        // Download image
        const imgRes = await axios.get(imageData.url, {
          responseType: 'arraybuffer',
          httpsAgent: this.agent,
          timeout: 60000,
        });

        const buffer = Buffer.from(imgRes.data);
        const uuidName = uuidv4();
        const ext = 'jpg';
        const objectName = `${uuidName}.${ext}`;

        this.logger.debug(`📦 Buffer size: ${buffer.length} bytes`);

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

        // Upload to Object Storage
        const bucketname = tosConfigs().tosBucket;
        const imagePath = `organize/${body.organizationId}/${body.projectId}/image-generate/${objectName}`;
        await this.tosService.putObject(bucketname, imagePath, buffer);

        uploadedImages.push(objectName);

        // Save to Gallery
        await this.galleryRepo.create({
          data: {
            taskId,
            projectId: body.projectId,
            userId,
            prompt: body.prompt,
            imageUrl: objectName,
            typeGenerate: 'image',
            genneratedStatus: 'SUCCESS',
            status: false,
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
          24 * 60 * 60,
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
            .filter((image) => !/^https?:\/\//i.test(image))
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
        error: error.message,
      });
      const creditForFailure = await this.generateHelperService.getUsedCredit(
        0,
        body,
        await this.masterModelTypeRepo.findOne({
          where: { modelType: body.model },
        }),
      );
      await this.generateHelperService.updateUsedCreditFail(
        userId,
        body.organizationId,
        body.projectId,
        'credit',
        creditForFailure?.credit ?? 0,
      );
      // ส่ง error event ไปยัง Core Service
      await this.publishToCore(clientId, 'worker:image-error', {
        taskId,
        error: error.message,
        timestamp: new Date().toISOString(),
        projectId: body.projectId,
        type: 'image',
        message: error.message,
      });
      await this.galleryRepo.create({
        data: {
          taskId,
          projectId: body.projectId,
          userId,
          prompt: body.prompt,
          imageUrl: '',
          typeGenerate: 'image',
          genneratedStatus: 'FAILED',
          status: false,
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
   * ส่ง event ไปยัง Core Service ผ่าน Redis Pub/Sub
   */
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
        24 * 60 * 60,
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

  async onModuleDestroy() {
    await this.redisPublisher.quit();
  }

  // map ชื่อ model (prefix) → payload builder function
  private async buildPayload(body: RequestImageGenerateDto, sendConfig: any) {
    const builder = this.payloadBuilders[sendConfig.type];
    return builder(body, sendConfig);
  }
  private readonly payloadBuilders: Record<
    string,
    (body: RequestImageGenerateDto, modelDetail: any) => Promise<any>
  > = {
    seedream1: this.buildSeedream1Payload.bind(this),
  };

  private async buildSeedream1Payload(
    body: RequestImageGenerateDto,
    modelDetail: any,
  ) {
    const images = (await body?.image)
      ? await Promise.all(
          body.image.map(async (img) =>
            // ค่าที่เป็น URL อยู่แล้ว (เช่น reference จาก workflow ที่ presign ตั้งแต่ submit)
            // ส่งต่อตรง ๆ ไม่ presign ซ้ำ — ส่วน key ปกติยัง presign เหมือนเดิม
            /^https?:\/\//i.test(img)
              ? img
              : await this.tosService.getPreSignedUrl(
                  tosConfigs().tosBucket,
                  img,
                ),
          ),
        )
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
}
