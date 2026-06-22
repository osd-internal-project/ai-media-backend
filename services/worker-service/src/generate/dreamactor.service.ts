import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';
import { Logger, Injectable, BadRequestException } from '@nestjs/common';
import {
  GalleryRepository,
  LogRepository,
  MAX_CONCURRENT_TASKS_PER_TYPE,
  QUEUE_NAME_DREAMACTOR,
  RefImageRepository,
  RequestDreamactorGenerateDto,
  TosService,
} from '@ai-media/share';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { Redis } from 'ioredis';
import { OnWorkerEvent } from '@nestjs/bullmq';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import * as https from 'https';
import * as path from 'path';
import * as fs from 'fs';
import * as ffmpeg from 'fluent-ffmpeg';
import { tosConfigs } from 'src/configs';
import { GenerateHelperService } from './generate-helper.service';
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static');

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath.path);

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
        const accessKey =
          process.env.BYTEPLUS_ACCESS_KEY ||
          'AKAPYzE5OGNhNmRkZDVlNDllYzlhM2MwNTU3MTE0YWM4ZGM';
        const secretKey =
          process.env.BYTEPLUS_SECRET_KEY ||
          'T1RnM09HSTJNVFEwWmpBek5EY3lNMkZqWmpabE5tWm1aR0ZrT0dabU9UVQ==';
        const modelDetail = { modelType: reqKey };
        const builder = this.payloadBuilders[sendConfig?.type ?? 'dreamactor'];
        const submitPayload = await builder(body, modelDetail);
        const queryParams = {
          Action: 'CVSync2AsyncSubmitTask',
          Version: '2024-06-06',
        };
        const headers = this.signBytePlusRequest(
          'POST',
          '/',
          queryParams,
          submitPayload,
          accessKey,
          secretKey,
        );
        let apiRes: any;
        try {
          apiRes = await axios.post(sendApi, submitPayload, {
            headers,
            params: queryParams,
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
        const accessKey =
          process.env.BYTEPLUS_ACCESS_KEY ||
          'AKAPYzE5OGNhNmRkZDVlNDllYzlhM2MwNTU3MTE0YWM4ZGM';
        const secretKey =
          process.env.BYTEPLUS_SECRET_KEY ||
          'T1RnM09HSTJNVFEwWmpBek5EY3lNMkZqWmpabE5tWm1aR0ZrT0dabU9UVQ==';

        const queryParams = {
          Action: 'CVSync2AsyncGetResult',
          Version: '2024-06-06',
        };
        const bodyPayload = {
          req_key: reqKey,
          task_id: dreamactorTaskId,
        };

        const headers = this.signBytePlusRequest(
          'POST',
          '/',
          queryParams,
          bodyPayload,
          accessKey,
          secretKey,
        );

        const getResult = await axios.post(url, bodyPayload, {
          headers: headers,
          params: queryParams,
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
          const videoRes = await axios.get(videoUrl, {
            responseType: 'arraybuffer',
            httpsAgent: this.agent,
          });

          const buffer = Buffer.from(videoRes.data);
          const uuidName = uuidv4();
          const ext = 'mp4';

          const mockFile: Express.Multer.File = {
            fieldname: 'file',
            originalname: `${uuidName}.${ext}`,
            encoding: '7bit',
            mimetype: 'video/mp4',
            buffer: buffer,
            size: buffer.length,
            stream: null,
            destination: '',
            filename: '',
            path: '',
          };
          const result = await this.uploadVideoWithThumbnail(
            body.organizationId,
            body.projectId,
            mockFile,
            taskId,
          );

          await this.publishToCore(
            clientId,
            'worker:dreamactor-upload-success',
            {
              taskId,
              videoUrl: await this.tosService.getPreSignedUrl(
                tosConfigs().tosBucket,
                `organize/${body.organizationId}/${body.projectId}/dreamactor-generate/${result.file}`,
              ),
              thumbnailUrl: await this.tosService.getPreSignedUrl(
                tosConfigs().tosBucket,
                `organize/${body.organizationId}/${body.projectId}/dreamactor-generate/${result.thumbnail}`,
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

  private async uploadVideoWithThumbnail(
    organizationId: string,
    projectId: string,
    file: Express.Multer.File,
    id: string,
  ) {
    const videoFileName = `${Date.now()}-${file.originalname}`;
    const thumbnailFileName = `thumb-${Date.now()}.png`;
    const objectName = `${videoFileName}`;
    const thumbnailObjectName = `${thumbnailFileName}`;

    // Use os.tmpdir() for better compatibility
    const os = require('os');
    const tempDir = os.tmpdir();
    const tempVideoPath = path.join(tempDir, videoFileName);
    const tempThumbPath = path.join(tempDir, thumbnailFileName);

    // 2. เขียนไฟล์วิดีโอลง Disk ชั่วคราวเพื่อให้ FFmpeg อ่าน
    fs.writeFileSync(tempVideoPath, file.buffer);

    try {
      // 3. สร้าง Thumbnail ด้วย FFmpeg
      await new Promise((resolve, reject) => {
        ffmpeg(tempVideoPath)
          .screenshots({
            count: 1,
            folder: path.dirname(tempThumbPath),
            filename: path.basename(tempThumbPath),
            timemarks: ['20%'], // จับภาพที่ตำแหน่ง 20% ของวิดีโอ
            size: '320x?', // ปรับขนาด (กว้าง 320, สูง auto)
          })
          .on('end', resolve)
          .on('error', reject);
      });

      // 4. Upload Video ขึ้น MinIO (ใช้ putObject แทน fPutObject)

      await this.tosService.putObject(
        tosConfigs().tosBucket,
        `organize/${organizationId}/${projectId}/dreamactor-generate/${objectName}`,
        file.buffer,
      );

      // 5. Upload Thumbnail ขึ้น MinIO
      // อ่านไฟล์ thumbnail ขึ้นมาเป็น buffer ก่อน
      const thumbBuffer = fs.readFileSync(tempThumbPath);
      await this.tosService.putObject(
        tosConfigs().tosBucket,
        `organize/${organizationId}/${projectId}/dreamactor-generate/${thumbnailObjectName}`,
        thumbBuffer,
      );

      // 6. (Optional) สร้าง Presigned URL แบบ Public (ถ้า bucket เป็น public ไม่ต้องใช้ presigned ก็ได้ แต่ code เดิมใช้)
      // const videoUrl = await this.minioClient.presignedGetObject(bucket, objectName, 24 * 60 * 60);
      // const thumbUrl = await this.minioClient.presignedGetObject(bucket, thumbnailObjectName, 24 * 60 * 60);

      return {
        file: objectName,
        thumbnail: thumbnailObjectName,
      };
    } catch (error: any) {
      console.error('Error in uploadVideoWithThumbnail:', error);
      throw new BadRequestException('Error processing video: ' + error.message);
    } finally {
      // 7. Cleanup: ลบไฟล์ temp ทิ้งเสมอ
      try {
        if (fs.existsSync(tempVideoPath)) fs.unlinkSync(tempVideoPath);
        if (fs.existsSync(tempThumbPath)) fs.unlinkSync(tempThumbPath);
      } catch (cleanupError) {
        console.error('Error cleaning up temp files:', cleanupError);
      }
    }
  }

  private signBytePlusRequest(
    method: string,
    path: string,
    queryParams: Record<string, string>,
    body: any,
    accessKey: string,
    secretKey: string,
  ) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const crypto = require('crypto');
    const region = 'ap-singapore-1';
    const service = 'cv';
    const contentType = 'application/json';
    const host = 'cv.byteplusapi.com';

    const now = new Date();
    const x_date = now.toISOString().replace(/[:-]|\.\d{3}/g, ''); // YYYYMMDDTHHMMSSZ
    const short_date = x_date.slice(0, 8);

    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
    const x_content_sha256 = crypto
      .createHash('sha256')
      .update(bodyStr)
      .digest('hex');

    const queryString = Object.keys(queryParams)
      .sort()
      .map(
        (key) =>
          `${encodeURIComponent(key)}=${encodeURIComponent(queryParams[key])}`,
      )
      .join('&');

    const canonicalHeaders =
      `content-type:${contentType}\n` +
      `host:${host}\n` +
      `x-content-sha256:${x_content_sha256}\n` +
      `x-date:${x_date}\n`;

    const signedHeaders = 'content-type;host;x-content-sha256;x-date';

    const canonicalRequest = [
      method,
      path,
      queryString,
      canonicalHeaders,
      signedHeaders,
      x_content_sha256,
    ].join('\n');

    const credentialScope = `${short_date}/${region}/${service}/request`;

    const stringToSign = [
      'HMAC-SHA256',
      x_date,
      credentialScope,
      crypto.createHash('sha256').update(canonicalRequest).digest('hex'),
    ].join('\n');

    const kDate = crypto
      .createHmac('sha256', secretKey)
      .update(short_date)
      .digest();
    const kRegion = crypto.createHmac('sha256', kDate).update(region).digest();
    const kService = crypto
      .createHmac('sha256', kRegion)
      .update(service)
      .digest();
    const kSigning = crypto
      .createHmac('sha256', kService)
      .update('request')
      .digest();

    const signature = crypto
      .createHmac('sha256', kSigning)
      .update(stringToSign)
      .digest('hex');

    const authorization = `HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return {
      'Content-Type': contentType,
      Host: host,
      'X-Content-Sha256': x_content_sha256,
      'X-Date': x_date,
      Authorization: authorization,
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
      image_urls: await Promise.all(
        [body.image[0]].map((url) =>
          this.tosService.getPreSignedUrl(tosConfigs().tosBucket, url),
        ),
      ),
      video_url: await this.tosService.getPreSignedUrl(
        tosConfigs().tosBucket,
        body.image[1],
      ),
    };
  }

  async onModuleDestroy() {
    await this.redisPublisher.quit();
  }
}
