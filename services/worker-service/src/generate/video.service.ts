import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger, Injectable } from '@nestjs/common';
import {
    GalleryRepository,
    LogRepository,
    MasterDataConfigApiRepository,
    QUEUE_NAME_VDO,
    RefImageRepository,
    RequestVideoGenerateDto,
} from '@ai-media/share';
import { MinioClientService } from 'src/minio-client/minio-client.service';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { Redis } from 'ioredis';
import { OnWorkerEvent } from '@nestjs/bullmq';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import * as https from 'https';

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
        private readonly minioClientService: MinioClientService,
        private readonly galleryRepo: GalleryRepository,
        private readonly logrepo: LogRepository,
        private readonly refImageRepository: RefImageRepository,
        private readonly masterdataconfigapiRepo: MasterDataConfigApiRepository,
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
                });
                // const url = `${getConfigApi.apiCreateTaskVdo}/${taskId}`;
                // const token = getConfigApi.authorization;
                // const authHeader = token.startsWith('Bearer ')
                //     ? token
                //     : `Bearer ${token}`;

                // const getResult = await axios.get(url, {
                //     headers: {
                //         'Content-Type': 'application/json',
                //         Authorization: authHeader,
                //     },
                //     httpsAgent: this.agent,
                // });

                // mockdata
                const getResult = {
                    data: {
                        id: "cgt-2025******-****",
                        model: "seedance-1-5-pro-251215",
                        status: "succeeded",
                        content: {
                            video_url: "https://ark-content-generation-ap-southeast-1.tos-ap-southeast-1.volces.com/seedance-1-5-pro/02176976063449400000000000000000000ffffc0a8a8339a41f1.mp4?X-Tos-Algorithm=TOS4-HMAC-SHA256&X-Tos-Credential=AKLTYWJkZTExNjA1ZDUyNDc3YzhjNTM5OGIyNjBhNDcyOTQ%2F20260130%2Fap-southeast-1%2Ftos%2Frequest&X-Tos-Date=20260130T081213Z&X-Tos-Expires=86400&X-Tos-Signature=13ba5153558f1d940cae288ca656b3bd6ec11ff8961c4934788df877b48544d0&X-Tos-SignedHeaders=host"
                        },
                        usage: {
                            completion_tokens: 108900,
                            total_tokens: 108900
                        },
                        created_at: 1743414619,
                        updated_at: 1743414673,
                        seed: 10,
                        resolution: "720p",
                        ratio: "16:9",
                        duration: 5,
                        framespersecond: 24,
                        service_tier: "default",
                        execution_expires_after: 172800,
                        generate_audio: true,
                        draft: false
                    }
                }
                const status = 'succeeded'
                if (status === "succeeded") {
                    console.log(getResult.data)
                    const { id, content, usage } = getResult.data as BytepluseResponse;
                    console.log("----- task succeeded -----");
                    await this.publishToCore(clientId, 'worker:video-url-success', {
                        taskId,
                        videoUrl: content.video_url,
                        timestamp: new Date().toISOString(),
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

                    const result = await this.minioClientService.uploadVideoWithThumbnail(
                        process.env.MINIO_BUCKET_VDO,
                        mockFile,
                        taskId,
                    );
                    await this.publishToCore(clientId, 'worker:video-upload-success', {
                        taskId,
                        videoUrl: result.file,
                        thumbnailUrl: result.thumbnail,
                        timestamp: new Date().toISOString(),
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

    async onModuleDestroy() {
        await this.redisPublisher.quit();
    }
}