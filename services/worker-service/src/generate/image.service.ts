import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import * as https from 'https';
import * as path from 'path';
import { RequestImageGenerateDto, GalleryRepository, LogRepository, QUEUE_NAME_IMAGE, RefImageRepository, TosService } from '@ai-media/share';
import { tosConfigs } from 'src/configs';

interface ImageProcessJob {
    taskId: string;
    clientId: string;
    body: RequestImageGenerateDto;
    userId: string;
    dataImage: { url: string; size: string }[];
    usage: {
        generated_images: number;
        output_tokens: number;
        total_tokens: number;
    };
}

@Injectable()
@Processor(QUEUE_NAME_IMAGE)
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

    async process(job: Job<ImageProcessJob>): Promise<any> {
        const { taskId, clientId, body, userId, dataImage, usage } = job.data;

        this.logger.log(`👨‍🍳 Processing job: ${job.id}, Task: ${taskId}`);

        try {
            const totalImages = dataImage.length;
            const uploadedImages: string[] = [];
            const bytepluseUrl = []

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
                bytepluseUrl.push(imageData.url)
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
                const objectName = `${uuidv4()}/${uuidName}.${ext}`;

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

                // Upload to MinIO
                const bucketname = tosConfigs().tosBucket;
                const imagePath = `organize/${body.organizeId}/image-generate/${objectName}`;
                await this.tosService.putObject(
                    bucketname,
                    imagePath,
                    buffer,
                );

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
                        generateConfig: this.buildGenerateConfig({
                            ratio: body.ratio,
                            width: body.width,
                            height: body.height,
                            prompt: body.prompt,
                            duration: 0,
                            modelName: body.model,
                            imageCount: body.maxImages,
                            resolution: body.size,
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

                // ส่ง event แต่ละรูปที่เสร็จ
                await this.publishToCore(clientId, 'worker:image-complete', {
                    taskId,
                    imageUrl: bytepluseUrl,
                    index: index + 1,
                    total: totalImages,
                    projectId: body.projectId,
                    type: 'image',
                });
            }

            // 3. Save Log
            await this.logrepo.create({
                data: {
                    taskId,
                    projectId: body.projectId,
                    userId,
                    prompt: body.prompt,
                    typeGenerate: 'image',
                    status: 'success',
                    resolution: body.size,
                    ratio: body.ratio,
                    generateAudio: false,
                    tokenUsed: usage.total_tokens || 0,
                    ImageUsed: usage.generated_images || 0,
                    referenceImages: body.image.length > 0 ? body.image : [],
                    generateConfig: this.buildGenerateConfig({
                        ratio: body.ratio,
                        width: body.width,
                        height: body.height,
                        prompt: body.prompt,
                        duration: 0,
                        modelName: body.model,
                        imageCount: body.maxImages,
                        resolution: body.size,
                        generateAudio: false,
                    }),
                },
            });

            // 4. อัพเดทสถานะเป็น completed
            await this.updateTaskStatus(taskId, {
                status: 'completed',
                completedAt: new Date().toISOString(),
                imageCount: uploadedImages.length,
                images: uploadedImages,
            });

            // 5. ส่ง event "complete" ไปยัง Core Service
            await this.publishToCore(clientId, 'worker:complete', {
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
                        resolution: body.size,
                        generateAudio: false,
                    }),
                },
            });
            if (body.image.length > 0) {
                body.image.map((image) => {
                    const imageName = path.parse(image).name;
                    this.refImageRepository.update({
                        where: {
                            uid: imageName,
                        },
                        data: {
                            status: 'completed',
                        },
                    });
                })
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
            await this.publishToCore(clientId, 'worker:generate:error', {
                taskId,
                error: error.message,
                timestamp: new Date().toISOString(),
                projectId: body.projectId,
                type: 'image',
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
                    resolution: body.size,
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
                        resolution: body.size,
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