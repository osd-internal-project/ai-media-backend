import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';
import { Logger, Injectable, BadRequestException } from '@nestjs/common';
import {
  GalleryRepository,
  LogRepository,
  MasterdataModelTypeRepository,
  MAX_CONCURRENT_TASKS_PER_TYPE,
  QUEUE_NAME_VDO,
  RefImageRepository,
  RequestVideoGenerateDto,
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
import ffmpeg = require('fluent-ffmpeg');
import { tosConfigs } from 'src/configs';
import { GenerateHelperService } from './generate-helper.service';
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static');

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath.path);

interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
  stream: null;
  destination: string;
  filename: string;
  path: string;
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

  async process(job: any, token?: string): Promise<any> {
    const {
      taskId,
      clientId,
      body,
      userId,
      statusBaseUrl,
      sendApi,
      sendConfig,
    } = job.data as VideoProcessJob;
    console.log(`taskId`, taskId, clientId, body, userId);
    // Per-org LLM gateway key set by the producer (falls back to the model token).
    const authorization: string =
      (job.data as any).authorization ?? sendConfig?.authorization ?? '';
    const redisVideoCacheKey = `${body.organizationId}/${body.projectId}/credit_used_${userId}`;

    this.logger.log(`👨‍🍳 Processing job: ${job.id}, Task: ${taskId}`);

    try {
      // 0. Call external API here so queue concurrency limits simultaneous API calls.
      // Backward-compat: old jobs already have videoTaskId; new jobs need the API call.
      let videoTaskId: string;
      let authToken: string = authorization;
      if ((job.data as any).videoTaskId) {
        videoTaskId = (job.data as any).videoTaskId;
        authToken = authorization;
      } else {
        const axiosConfig = {
          headers: {
            'Content-Type': sendConfig.configType,
            Authorization: `Bearer ${authorization}`,
          },
          httpsAgent: this.agent,
        };
        const payload = await this.buildPayload(body, sendConfig);
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
          // clean message. The outer catch owns all failure reporting (status,
          // event, credit refund, DB rows) — don't duplicate it here.
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
        // resumes polling this provider task instead of submitting a new one
        // (which would re-generate and re-transfer the video).
        await job.updateData({ ...(job.data as any), videoTaskId });
      }

      // 1. ส่ง event "started" ไปยัง Core Service
      await this.publishToCore(clientId, 'worker:video-started', {
        taskId,
        timestamp: new Date().toISOString(),
        type: 'video',
        projectId: body.projectId,
      });

      // อัพเดทสถานะใน Redis
      await this.updateTaskStatus(taskId, {
        status: 'processing',
        startedAt: new Date().toISOString(),
      });
      const sleep = (ms: number) =>
        new Promise((resolve) => setTimeout(resolve, ms));

      // Bound the poll so a job stuck in a non-terminal provider state fails
      // cleanly instead of holding a worker slot (and re-running on restart).
      const POLL_TIMEOUT_MS = 20 * 60 * 1000;
      const pollStartedAt = Date.now();
      while (true) {
        if (Date.now() - pollStartedAt > POLL_TIMEOUT_MS) {
          throw new UnrecoverableError('generation timed out');
        }
        await this.publishToCore(clientId, 'worker:video-progress', {
          taskId,
          timestamp: new Date().toISOString(),
          type: 'video',
          projectId: body.projectId,
        });
        const url = `${statusBaseUrl}/${videoTaskId}`;
        const rawToken = authToken;
        const authHeader = rawToken.startsWith('Bearer ')
          ? rawToken
          : `Bearer ${rawToken}`;
        // Logger.debug('Status API response', { url, taskId, authHeader });

        const getResult = await axios.get(url, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: authHeader,
          },
          httpsAgent: this.agent,
        });
        Logger.debug('Status API response', getResult.data);

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
        const status = getResult.data.status;
        if (status === 'succeeded') {
          console.log(getResult.data);
          const { id, content, usage } = getResult.data as BytepluseResponse;
          console.log('----- task succeeded -----');
          await this.publishToCore(clientId, 'worker:video-url-success', {
            taskId,
            videoUrl: content.video_url,
            timestamp: new Date().toISOString(),
            type: 'video',
            projectId: body.projectId,
          });
          const uuidName = uuidv4();
          //before
           const videoRes = await axios.get(content.video_url, {
            responseType: 'arraybuffer',
            httpsAgent: this.agent,
          });
          const buffer = Buffer.from(videoRes.data);
          //  const uuidName = uuidv4();
          const ext = 'mp4';

          const mockFile: MulterFile = {
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
          
           
         
          // const videoFile = `${uuidName}.mp4`;
          // const thumbFile = `thumb-${uuidName}.jpg`;
          // const videoKey = `organize/${body.organizationId}/${body.projectId}/video-generate/${videoFile}`;
          // const thumbKey = `organize/${body.organizationId}/${body.projectId}/video-generate/${thumbFile}`;

          // // Let TOS pull the finished video straight from the provider URL: the
          // // bytes flow provider→TOS and never transit this pod (removes the
          // // download+re-upload egress spike and the whole-video buffering/OOM).
          // await this.tosService.fetchObject(
          //   tosConfigs().tosBucket,
          //   videoKey,
          //   content.video_url,
          // );
          // // Thumbnail is produced server-side (TOS video/snapshot); only the
          // // small image passes through this pod. Snapshot ~20% into the clip.
          // await this.tosService.createVideoThumbnail(
          //   tosConfigs().tosBucket,
          //   videoKey,
          //   thumbKey,
          //   Math.floor((Number(body.duration) || 5) * 0.2 * 1000),
          // );
          // const result = { file: videoFile, thumbnail: thumbFile };
          console.log('returngenerate');

          await this.publishToCore(clientId, 'worker:video-upload-success', {
            taskId,
            videoUrl: await this.tosService.getPreSignedUrl(
              tosConfigs().tosBucket,
              `organize/${body.organizationId}/${body.projectId}/video-generate/${result.file}`,
            ),
            thumbnailUrl: await this.tosService.getPreSignedUrl(
              tosConfigs().tosBucket,
              `organize/${body.organizationId}/${body.projectId}/video-generate/${result.thumbnail}`,
            ),
            timestamp: new Date().toISOString(),
            type: 'video',
            projectId: body.projectId,
          });
          // await this.redis.set(
          //   redisVideoCacheKey,
          //   usage.total_tokens.toString(),
          //   'EX',
          //   24 * 60 * 60,
          // );
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

          //Update used credit
          if (log) {
            const updated =
              (await this.generateHelperService.updateUsedCreditSuccess(
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
          const updated =
            (await this.generateHelperService.updateUsedCreditFail(
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
          // console.error("Error:", getResult.data.error);
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
      await this.publishToCore(clientId, 'worker:video-complete', {
        taskId,
        success: true,
        timestamp: new Date().toISOString(),
        type: 'video',
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
    } catch (error) {
      const err = error as Error;
      this.logger.error(`❌ Job ${job.id} failed: ${err.message}`, err.stack);

      // อัพเดทสถานะเป็น failed
      await this.updateTaskStatus(taskId, {
        status: 'failed',
        failedAt: new Date().toISOString(),
        error: err.message,
      });

      // ส่ง error event ไปยัง Core Service
      await this.publishToCore(clientId, 'worker:video-error', {
        taskId,
        error: err.message,
        timestamp: new Date().toISOString(),
        type: 'video',
        projectId: body.projectId,
        message: err.message,
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

      throw error;
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
    file: MulterFile,
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
        `organize/${organizationId}/${projectId}/video-generate/${objectName}`,
        file.buffer,
      );

      // 5. Upload Thumbnail ขึ้น MinIO
      // อ่านไฟล์ thumbnail ขึ้นมาเป็น buffer ก่อน
      const thumbBuffer = fs.readFileSync(tempThumbPath);
      await this.tosService.putObject(
        tosConfigs().tosBucket,
        `organize/${organizationId}/${projectId}/video-generate/${thumbnailObjectName}`,
        thumbBuffer,
      );

      // 6. (Optional) สร้าง Presigned URL แบบ Public (ถ้า bucket เป็น public ไม่ต้องใช้ presigned ก็ได้ แต่ code เดิมใช้)
      // const videoUrl = await this.minioClient.presignedGetObject(bucket, objectName, 24 * 60 * 60);
      // const thumbUrl = await this.minioClient.presignedGetObject(bucket, thumbnailObjectName, 24 * 60 * 60);

      return {
        file: objectName,
        thumbnail: thumbnailObjectName,
      };
    } catch (error) {
      console.error('Error in uploadVideoWithThumbnail:', error);
      throw new BadRequestException(
        'Error processing video: ' + (error as Error).message,
      );
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

  // แยก builder แต่ละ model เป็น private method
  private readonly payloadBuilders: Record<
    string,
    (body: RequestVideoGenerateDto, modelDetail: any) => any
  > = {
    seedance1: this.buildSeedance1Payload.bind(this),
    seedance2: this.buildSeedance2Payload.bind(this),
  };

  private async buildPayload(body: RequestVideoGenerateDto, sendConfig: any) {
    const builder = this.payloadBuilders[sendConfig.type];
    return builder(body, sendConfig);
  }

  /**
   * presign เฉพาะค่าที่เป็น object key — ถ้าเป็น URL อยู่แล้ว (เช่น reference จาก workflow
   * ที่ presign ตั้งแต่ submit) ส่งต่อตรง ๆ ไม่ presign ซ้ำ
   */
  private async presignRef(value: string): Promise<string> {
    return /^https?:\/\//i.test(value)
      ? value
      : this.tosService.getPreSignedUrl(tosConfigs().tosBucket, value);
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
