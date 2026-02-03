import {
    AuditLogRepository,
    CreateGenerateDto,
    ErrorLogRepository,
    GalleryRepository,
    LogRepository,
    MasterDataConfigApiRepository,
    MasterdataModelTypeRepository,
    ProjectMemberRepository,
    QUEUE_NAME_IMAGE,
    UsersRepository,
    ByteplusePayloadImage,
    RequestImageGenerateDto,
    RequestVideoGenerateDto,
    QUEUE_NAME_VDO,
    ByteplusePayloadVideo
} from '@ai-media/share';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { InjectQueue } from '@nestjs/bullmq';
import {
    BadRequestException,
    ConflictException,
    HttpException,
    Inject,
    Injectable,
    InternalServerErrorException,
    Logger
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import axios, { AxiosRequestConfig } from 'axios';
import { Queue } from 'bullmq';
import * as https from 'https';
import Redis from 'ioredis';
import { minioConfigs } from 'src/configs';
import { MinioClientService } from 'src/minio-client/minio-client.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class GenerateService {
    private readonly agent = new https.Agent({ rejectUnauthorized: false });

    constructor(
        private readonly masterdataconfigapiRepo: MasterDataConfigApiRepository,
        private readonly projectMemberRepository: ProjectMemberRepository,
        private readonly userRepo: UsersRepository,
        private readonly errorLogRepo: ErrorLogRepository,
        private readonly auditLogRepo: AuditLogRepository,
        private readonly logrepo: LogRepository,
        private readonly galleryRepo: GalleryRepository,
        private readonly modeltypeRepo: MasterdataModelTypeRepository,
        private readonly minioClientSerives: MinioClientService,
        @Inject(minioConfigs.KEY)
        private minioconfig: ConfigType<typeof minioConfigs>,
        @InjectRedis() private readonly redis: Redis,
        @InjectQueue(QUEUE_NAME_IMAGE) private imageQueue: Queue,
        @InjectQueue(QUEUE_NAME_VDO) private videoQueue: Queue,
    ) { }

    /**
   * สร้าง Generation Task และส่งเข้า Queue
   */
    async createGenerationTask(body: RequestImageGenerateDto, clientId: string) {
        const taskId = body.taskId;
        const redisImageCacheKey = `image_used_${body.userId}`;

        try {
            // 1. Validate User & Project
            const { user, projectMember } = await this.validateUserAndProject(
                body.userId,
                body.projectId,
            );

            if (!projectMember) {
                return { status: 400, data: 'Team member not found' };
            }

            if (user) {
                await this.logAudit(user.userId, 'CREATE', body, taskId);
            }

            // 2. Check Quota
            const { isQuotaExceeded, currentImageUsed } = await this.checkTokenQuota(
                user.userId,
                body,
                projectMember,
                redisImageCacheKey,
            );

            if (isQuotaExceeded) {
                return { status: 400, data: 'Token limit exceeded' };
            }

            // 3. Get Config & Model
            const getConfigApi = await this.masterdataconfigapiRepo.findOne({
                where: { id: 1 },
            });

            const modelDetail = await this.modeltypeRepo.findOne({
                where: { modelType: body.model, type: body.type },
            });

            if (!modelDetail) {
                return { status: 400, data: 'Model not found' };
            }

            let imageUrls: string[] = [];
            if (body.image && body.image.length > 0) {
                imageUrls = await Promise.all(
                    body.image.map((img) =>
                        this.minioClientSerives.getPresignedUrl(
                            this.minioconfig.minioBucketUpload,
                            img,
                        ),
                    ),
                );
            }
            // 4. Prepare Payload
            const { basePayload, axiosConfig } = await this.prepareGenerationPayloadImage(
                body,
                modelDetail,
                getConfigApi,
                user.userId,
                taskId,
                imageUrls
            );

            // 5. Call External API
            const res = await this.executeGenerationRequest(
                getConfigApi.apiCreateImage,
                basePayload,
                axiosConfig,
            );

            // data test
            // const res = {
            //     data: {
            //         data: [
            //             {
            //                 url: 'https://www.aicave.ai/public/api/v1/s3/ai-media-image/80ecc909-bb73-4873-89d2-9605fc801be7/decae022-3b8a-4d4f-a2f1-4410d81b7cb1.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=LB7kAwp1rgI1g4d3h0Wa%2F20260202%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20260202T155105Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host&X-Amz-Signature=f6c44142b217fba0cbfe277ae6988538ca76e2dd41f1835822f31da7d3378bfe',
            //                 size: '2048x2048'
            //             }
            //         ],
            //         usage: {
            //             generated_images: 1,
            //             output_tokens: 16280,
            //             total_tokens: 16280
            //         }
            //     }
            // }

            // 6. อัพเดท cache
            await this.redis.set(
                redisImageCacheKey,
                currentImageUsed.toString(),
                'EX',
                24 * 60 * 60,
            );

            // 7. สร้าง Job ใน Queue
            const job = await this.imageQueue.add(
                QUEUE_NAME_IMAGE,
                {
                    taskId,
                    clientId,
                    body: { ...body },
                    userId: user.userId,
                    dataImage: res.data.data,
                    usage: res.data.usage,
                },
                {
                    jobId: taskId,
                    attempts: 3,
                    backoff: {
                        type: 'exponential',
                        delay: 2000,
                    },
                    removeOnComplete: 100,
                    removeOnFail: 50,
                },
            );

            // 8. บันทึก task metadata ใน Redis
            await this.redis.set(
                `task:${taskId}`,
                JSON.stringify({
                    taskId,
                    jobId: job.id,
                    clientId,
                    userId: user.userId,
                    projectId: body.projectId,
                    status: 'queued',
                    totalImages: res.data.data.length,
                    createdAt: new Date().toISOString(),
                }),
                'EX',
                24 * 60 * 60,
            );

            console.log(`✅ Task created: ${taskId}, Job ID: ${job.id}`);
            return {
                status: 200,
                // data: {
                //     taskId: taskId.toString(),
                //     jobId: job.id,
                //     message: 'Image generation queued',
                //     estimatedImages: res.data.data.length,
                // },
                data: {
                    taskId,
                    projectId: body.projectId,
                    userId: user.userId,
                    prompt: body.prompt,
                    imageUrl: res.data.data,
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
                    users: {
                        fullname: user.fullname,
                        userId: user.userId,
                        username: user.username,
                    },
                    referenceImages: imageUrls,
                    resolution: body.size,
                    ratio: body.ratio,
                    imageUrls: [],
                },
            };
        } catch (error) {
            console.error('Error creating generation task:', error);
            this.handleGenerationError(error, body.userId);
        }
    }

    /**
     * สร้าง Generation Task สำหรับ Video และส่งเข้า Queue
     */
    async createVideoGenerationTask(body: RequestVideoGenerateDto, clientId: string) {
        let taskId = body.taskId;

        try {
            // 1. Validate User & Project
            const { user, projectMember } = await this.validateUserAndProject(
                body.userId,
                body.projectId,
            );

            if (!projectMember) {
                return { status: 400, data: 'Team member not found' };
            }

            if (user) {
                await this.logAudit(user.userId, 'CREATE', body, taskId);
            }

            // TODO: Implement Quota Check for Video if needed
            const modelDetail = await this.modeltypeRepo.findOne({
                where: { modelType: body.model, type: 'video' },
            });

            const getConfigApi = await this.masterdataconfigapiRepo.findOne({
                where: { id: 1 },
            });

            if (!modelDetail) {
                return { status: 400, data: 'Model not found' };
            }

            // 4. Prepare Payload
            const { basePayload, axiosConfig } = await this.prepareGenerationPayloadVideo(
                body,
                getConfigApi,
            );

            console.log('basePayload', basePayload)

            // 5. Call External API
            const res = await this.executeGenerationRequestVideo(
                getConfigApi.apiCreateTaskVdo,
                basePayload,
                axiosConfig,
            );

            // data mockup
            // const res = {
            //     data: {
            //         id: uuidv4(),
            //     },
            // };
            taskId = res.data.id;
            await this.galleryRepo.create({
                data: {
                    taskId,
                    projectId: body.projectId,
                    userId: user.userId,
                    prompt: body.prompt,
                    imageUrl: "",
                    typeGenerate: 'video',
                    genneratedStatus: 'PENDING',
                    status: false,
                    generateConfig: this.buildGenerateConfig({
                        ratio: body.ratio,
                        width: body.width,
                        height: body.height,
                        prompt: body.prompt,
                        duration: +body.duration,
                        modelName: body.model,
                        imageCount: 0,
                        resolution: body.size,
                        draft: body.draft,
                        generateAudio: body.generateAudio,
                        watermark: body.watermark,
                    }),
                },
            });
            await this.logrepo.create({
                data: {
                    taskId,
                    projectId: body.projectId,
                    userId: user.userId,
                    prompt: body.prompt,
                    typeGenerate: 'video',
                    status: 'pending',
                    tokenUsed: 0,
                    ImageUsed: 0,
                    generateAudio: body.generateAudio,
                    referenceImages: body.image.length > 0
                        ? body.image.filter((item) => item !== null)
                        : [],
                    resolution: body.size,
                    ratio: body.ratio,
                    generateConfig: this.buildGenerateConfig({
                        ratio: body.ratio,
                        width: body.width,
                        height: body.height,
                        prompt: body.prompt,
                        duration: +body.duration,
                        modelName: body.model,
                        imageCount: 0,
                        resolution: body.size,
                        draft: body.draft,
                        generateAudio: body.generateAudio,
                        watermark: body.watermark,
                    }),
                },
            });

            // 7. สร้าง Job ใน Queue
            const job = await this.videoQueue.add(
                QUEUE_NAME_VDO,
                {
                    taskId,
                    clientId,
                    body: { ...body },
                    userId: user.userId,
                    videoTaskId: res.data.id,
                },
                {
                    jobId: taskId,
                    attempts: 3,
                    backoff: {
                        type: 'exponential',
                        delay: 2000,
                    },
                    removeOnComplete: 100,
                    removeOnFail: 50,
                },
            );

            // 8. บันทึก task metadata ใน Redis
            await this.redis.set(
                `task:${taskId}`,
                JSON.stringify({
                    taskId,
                    jobId: job.id,
                    clientId,
                    userId: user.userId,
                    projectId: body.projectId,
                    status: 'queued',
                    type: 'video',
                    videoTaskId: res.data.id,
                    createdAt: new Date().toISOString(),
                }),
                'EX',
                24 * 60 * 60,
            );

            console.log(`✅ Video Task created: ${taskId}, Job ID: ${job.id}`);

            return {
                status: 200,
                data: {
                    taskId,
                    projectId: body.projectId,
                    userId: user.userId,
                    prompt: body.prompt,
                    typeGenerate: 'video',
                    genneratedStatus: 'PENDING',
                    createdAt: new Date().toISOString(),
                    status: false,
                    videoTaskId: res.data.id,
                    message: 'Video generation queued',
                    generateConfig: {
                        ratio: body.ratio,
                        width: body.width,
                        height: body.height,
                        content: body.prompt,
                        duration: body.duration.toString(),
                        modelName: body.model,
                        imageCount: 0,
                        resolution: body.size,
                        draft: body.draft,
                        generateAudio: body.generateAudio,
                        watermark: body.watermark,
                    },
                    users: {
                        fullname: user.fullname,
                        userId: user.userId,
                        username: user.username
                    },
                    referenceImages: [
                        ...(body.image[0] ? [body.image[0]] : []),
                        ...(body.image[1] ? [body.image[1]] : [])
                    ],
                    resolution: body.size,
                    ratio: body.ratio,
                    imageUrls: []
                },
            };
        } catch (error) {
            console.error('Error creating video generation task:', error);
            this.handleGenerationError(error, body.userId);
        }
    }

    /**
     * ดึงสถานะของ Task
     */
    async getTaskStatus(taskId: string) {
        const taskData = await this.redis.get(`task:${taskId}`);
        if (!taskData) {
            return { status: 'not_found' };
        }

        const task = JSON.parse(taskData);

        // ดึงสถานะจาก BullMQ
        const job = await this.imageQueue.getJob(task.jobId);
        if (!job) {
            return { status: 'not_found' };
        }

        const state = await job.getState();
        const progress = job.progress || {};

        return {
            taskId,
            jobId: task.jobId,
            status: state,
            progress,
            createdAt: task.createdAt,
            totalImages: task.totalImages,
            ...(state === 'completed' && {
                result: job.returnvalue,
            }),
            ...(state === 'failed' && {
                error: job.failedReason,
                attempts: job.attemptsMade,
            }),
        };
    }

    /**
     * ยกเลิก Task
     */
    async cancelTask(taskId: string) {
        try {
            const taskData = await this.redis.get(`task:${taskId}`);
            if (!taskData) {
                return { success: false, message: 'Task not found' };
            }

            const task = JSON.parse(taskData);
            const job = await this.imageQueue.getJob(task.jobId);

            if (!job) {
                return { success: false, message: 'Job not found' };
            }

            const state = await job.getState();

            if (state === 'completed' || state === 'failed') {
                return { success: false, message: `Job already ${state}` };
            }

            // Remove job from queue
            await job.remove();

            // อัพเดทสถานะใน Redis
            task.status = 'cancelled';
            task.cancelledAt = new Date().toISOString();
            await this.redis.set(`task:${taskId}`, JSON.stringify(task), 'EX', 24 * 60 * 60);

            console.log(`🚫 Task cancelled: ${taskId}`);

            return { success: true, message: 'Task cancelled successfully' };
        } catch (error) {
            console.error('Error cancelling task:', error);
            return { success: false, message: error.message };
        }
    }

    /**
     * ดึงรายการ tasks ของ user
     */
    async getUserTasks(userId: string, limit = 20) {
        const keys = await this.redis.keys(`task:*`);
        const tasks = [];

        for (const key of keys.slice(0, limit)) {
            const data = await this.redis.get(key);
            if (data) {
                const task = JSON.parse(data);
                if (task.userId === userId) {
                    tasks.push(task);
                }
            }
        }

        return tasks.sort((a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
    }

    // --- Helper Methods ---

    private async validateUserAndProject(userId: string, projectId: string) {
        const user = await this.userRepo.findOne({
            where: { token: userId },
        });

        if (!user) {
            throw new BadRequestException('User not found');
        }

        const projectMember = await this.projectMemberRepository.findOne({
            where: {
                projectId: projectId,
                userId: user.userId,
            },
        });

        return { user, projectMember };
    }

    private async checkTokenQuota(userId: string, body: RequestImageGenerateDto, projectMember: any, cacheKey: string): Promise<{ isQuotaExceeded: boolean, currentImageUsed: number, maxImageInPlan: number }> {
        let currentImageUsed = 0;
        const maxImage = body.maxImages || 0;

        if (cacheKey) {
            const cachedImageUsed = await this.redis.get(cacheKey);
            if (cachedImageUsed) {
                currentImageUsed = parseInt(cachedImageUsed);
            } else {
                // Fallback to DB calculation
                const aggregateResult = await this.logrepo.aggregate({
                    where: {
                        userId: userId,
                        typeGenerate: body.type,
                        projectId: body.projectId,
                        status: 'success',
                        createdAt: {
                            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
                            lt: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1),
                        },
                    },
                    _sum: {
                        ImageUsed: true,
                    },
                });
                currentImageUsed = aggregateResult._sum.ImageUsed || 0;
            }
        }

        const maxImageInPlan = projectMember?.maxImages || 0;
        currentImageUsed = currentImageUsed + maxImage;
        if (currentImageUsed > maxImageInPlan) {
            Logger.error(`Image used ${currentImageUsed + maxImage} exceed max image ${maxImageInPlan}`);
            return {
                isQuotaExceeded: true,
                currentImageUsed: currentImageUsed,
                maxImageInPlan: maxImageInPlan,
            };
        }

        return {
            isQuotaExceeded: false,
            currentImageUsed: currentImageUsed,
            maxImageInPlan: maxImageInPlan,
        }
    }

    private async prepareGenerationPayloadImage(
        body: RequestImageGenerateDto,
        modelDetail: any,
        configApi: any,
        userId: string,
        taskId: string,
        imageUrls?: string[]
    ) {
        const axiosConfig: AxiosRequestConfig = {
            headers: {
                'Content-Type': configApi.configType,
                Authorization: `${configApi.authorization}`,
            },
            httpsAgent: this.agent,
        };

        // let imageUrls: string[] = [];
        // if (body.image && body.image.length > 0) {
        //     imageUrls = await Promise.all(
        //         body.image.map((img) =>
        //             this.minioClientSerives.getPresignedUrl(
        //                 this.minioconfig.minioBucketUpload,
        //                 img,
        //             ),
        //         ),
        //     );
        // }
        // prompt: `create ${body.images || 1} images ${body.text}`,
        const basePayload = {
            model: body.model,
            prompt: body.prompt,
            response_format: 'url',
            ...body.image.length > 0 && { image: imageUrls },
            stream: configApi.stream ?? false,
            watermark: configApi.watermark ?? false,
            ratio: body.ratio,
            size: body.size,
            sequential_image_generation: body.sequentialImageGeneration,
            ...body.maxImages && { sequential_image_generation_options: { max_images: body.maxImages } },
        } as ByteplusePayloadImage;
        Logger.log(basePayload, 'basePayload');
        return { basePayload, axiosConfig };
    }

    private async prepareGenerationPayloadVideo(
        body: RequestVideoGenerateDto,
        configApi: any,
    ) {
        const axiosConfig: AxiosRequestConfig = {
            headers: {
                'Content-Type': configApi.configType,
                Authorization: `${configApi.authorization}`,
            },
            httpsAgent: this.agent,
        };

        const basePayload = {
            model: body.model,
            content: [
                {
                    type: "text",
                    text: body.prompt
                },
                ...(body.image[0] ? [{
                    type: "image_url",
                    image_url: {
                        url: await this.minioClientSerives.getPresignedUrl(this.minioconfig.minioBucketUpload, body.image[0])
                    },
                    role: "first_frame"
                }] : []),
                ...(body.image[1] ? [{
                    type: "image_url",
                    image_url: {
                        url: await this.minioClientSerives.getPresignedUrl(this.minioconfig.minioBucketUpload, body.image[1])
                    },
                    role: "last_frame"
                }] : []),
                //
            ],
            draft: body.draft,
            generate_audio: body.generateAudio,
            ratio: body.ratio,
            duration: body.duration,
            watermark: body.watermark,
        } as ByteplusePayloadVideo;
        return { basePayload, axiosConfig };
    }

    private async executeGenerationRequest(url: string, payload: any, config: AxiosRequestConfig) {
        return await axios.post(url, payload, config);
    }

    private async executeGenerationRequestVideo(url: string, payload: any, config: AxiosRequestConfig) {
        return await axios.post(url, payload, config);
    }

    private handleGenerationError(error: any, userId: string) {
        Logger.error(
            `Error generate image: ${error?.response?.data?.error_description || error.message}`,
            error?.response?.data ? JSON.stringify(error.response.data) : error.stack,
        );
        if (axios.isAxiosError(error) && error.response) {
            const { status, data } = error.response;
            const message = data?.error?.message;

            this.logError(userId, message, error.stack, data);
            throw new ConflictException(message);
        }

        throw new InternalServerErrorException('Failed to generate image');
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
        draft?: boolean,
        watermark?: boolean,
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
            ...(body?.draft && { draft: body?.draft }),
            ...(body?.watermark && { watermark: body?.watermark }),
        };
    }

    private async logAudit(
        userId: string,
        action: string,
        details: any,
        entityId: string,
    ) {
        try {
            await this.auditLogRepo.create({
                data: {
                    userId,
                    action: 'CREATE',
                    entityName: 'GenerateImage',
                    entityId,
                    newValues: details,
                } as any,
            });
        } catch (e) {
            Logger.error(`Failed to create audit log: ${e}`);
        }
    }

    private async logError(
        userId: string,
        message: string,
        stack: string,
        context?: any,
    ) {
        try {
            await this.errorLogRepo.create({
                data: {
                    serviceName: 'GenerateImageService',
                    severity: 'ERROR',
                    message,
                    stackTrace: stack,
                    context: context,
                    userId,
                } as any,
            });
        } catch (e) {
            Logger.error(`Failed to create error log: ${e}`);
        }
    }
}
