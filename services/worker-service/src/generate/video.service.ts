import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger, Injectable, BadRequestException } from '@nestjs/common';
import {
    GalleryRepository,
    LogRepository,
    MasterDataConfigApiRepository,
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
import * as ffmpeg from 'fluent-ffmpeg';
import { tosConfigs } from 'src/configs';
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static');

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath.path);

interface VideoProcessJob {
    taskId: string;
    clientId: string;
    body: RequestVideoGenerateDto;
    userId: string;
    videoTaskId: string;
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
@Processor(QUEUE_NAME_VDO)
export class VideoProcessor extends WorkerHost {
    private readonly logger = new Logger(VideoProcessor.name);
    private agent: https.Agent;
    private redisPublisher: Redis;

    constructor(
        @InjectRedis() private readonly redis: Redis,
        private readonly galleryRepo: GalleryRepository,
        private readonly logrepo: LogRepository,
        private readonly refImageRepository: RefImageRepository,
        private readonly masterdataconfigapiRepo: MasterDataConfigApiRepository,
        private readonly tosService: TosService,
    ) {
        super();
        this.agent = new https.Agent({
            rejectUnauthorized: false,
        });

        // สร้าง Redis Publisher สำหรับส่ง events ไปยัง Core Service
        this.redisPublisher = new Redis({
            host: process.env.REDIS_HOST || 'localhost',
            port: Number(process.env.REDIS_PORT) || 6379,
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

    async process(job: Job<VideoProcessJob>): Promise<any> {
        const { taskId, clientId, body, userId } = job.data;
        console.log(`taskId`, taskId, clientId, body, userId)

        this.logger.log(`👨‍🍳 Processing job: ${job.id}, Task: ${taskId}`);

        try {
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
                new Promise(resolve => setTimeout(resolve, ms));

            const getConfigApi = await this.masterdataconfigapiRepo.findOne({
                where: { id: 1 },
            });
            while (true) {
                await this.publishToCore(clientId, 'worker:video-progress', {
                    taskId,
                    timestamp: new Date().toISOString(),
                    type: 'video',
                    projectId: body.projectId,
                });
                const url = `${getConfigApi.apiCreateTaskVdo}/${taskId}`;
                const token = getConfigApi.authorization;
                const authHeader = token.startsWith('Bearer ')
                    ? token
                    : `Bearer ${token}`;

                const getResult = await axios.get(url, {
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: authHeader,
                    },
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
                const status = getResult.data.status;
                if (status === "succeeded") {
                    console.log(getResult.data)
                    const { id, content, usage } = getResult.data as BytepluseResponse;
                    console.log("----- task succeeded -----");
                    await this.publishToCore(clientId, 'worker:video-url-success', {
                        taskId,
                        videoUrl: content.video_url,
                        timestamp: new Date().toISOString(),
                        type: 'video',
                        projectId: body.projectId,
                    });
                    const videoRes = await axios.get(content.video_url, {
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
                    await this.publishToCore(clientId, 'worker:video-upload-success', {
                        taskId,
                        videoUrl: await this.tosService.getPreSignedUrl(
                            tosConfigs().tosBucket,
                            `organize/${body.organizationId}/${body.projectId}/generate-video/${result.file}`
                        ),
                        thumbnailUrl: await this.tosService.getPreSignedUrl(
                            tosConfigs().tosBucket,
                            `organize/${body.organizationId}/${body.projectId}/generate-video/${result.thumbnail}`
                        ),
                        timestamp: new Date().toISOString(),
                        type: 'video',
                        projectId: body.projectId,
                    });

                    await this.galleryRepo.updateMany({
                        where: { taskId: taskId },
                        data: {
                            imageUrl: result.file,
                            thumbnailUrl: result.thumbnail,
                            genneratedStatus: 'SUCCESS',
                        },
                    });
                    await this.logrepo.updateMany({
                        where: { taskId: taskId },
                        data: { status: 'success', tokenUsed: usage.total_tokens },
                    });
                    break;
                } else if (status === "failed") {
                    console.log("----- task failed -----");
                    // console.error("Error:", getResult.data.error);
                    break;
                } else {
                    console.log(`Current status: ${status}, Retrying after 10 seconds...`);
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
                    imageUrl: "",
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
                        resolution: body.size,
                        generateAudio: false,
                    }),
                },
            };
        } catch (error) {
            this.logger.error(`❌ Job ${job.id} failed: ${error.message}`, error.stack);

            // อัพเดทสถานะเป็น failed
            await this.updateTaskStatus(taskId, {
                status: 'failed',
                failedAt: new Date().toISOString(),
                error: error.message,
            });

            // ส่ง error event ไปยัง Core Service
            await this.publishToCore(clientId, 'worker:video-error', {
                taskId,
                error: error.message,
                timestamp: new Date().toISOString(),
                type: 'video',
                projectId: body.projectId,
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

            throw error;
        }
    }

    /**
     * ส่ง event ไปยัง Core Service ผ่าน Redis Pub/Sub
     */
    private async publishToCore(clientId: string, event: string, payload: any) {
        console.log(`worker:${event.split(':')[1] || 'event'}`)
        try {
            await this.redisPublisher.publish(
                `worker:${event.split(':')[1] || 'event'}`,
                JSON.stringify({
                    clientId,
                    event,
                    payload,
                    timestamp: new Date().toISOString(),
                }),
            );
        } catch (error) {
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
        ratio: string,
        width: number,
        height: number,
        prompt: string,
        duration: number,
        modelName: string,
        imageCount: number,
        resolution: string,
        generateAudio: boolean,
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

    async onModuleDestroy() {
        await this.redisPublisher.quit();
    }
}