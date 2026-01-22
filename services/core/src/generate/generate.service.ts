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
    UsersRepository
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
    ) { }

    /**
   * สร้าง Generation Task และส่งเข้า Queue
   */
    async createGenerationTask(body: CreateGenerateDto, clientId: string) {
        const taskId = uuidv4();
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
                where: { modelType: body.modelName, type: body.type },
            });

            if (!modelDetail) {
                return { status: 400, data: 'Model not found' };
            }

            // 4. Prepare Payload
            const { basePayload, axiosConfig } = await this.prepareGenerationPayload(
                body,
                modelDetail,
                getConfigApi,
            );

            // 5. Call External API
            // const res = await this.executeGenerationRequest(
            //     getConfigApi.apiCreateImage,
            //     basePayload,
            //     axiosConfig,
            // );

            const res = {
                data: {
                    data: [
                        {
                            url: 'https://www.aicave.ai/public/api/v1/s3/ai-media-image/608292c8-fdb2-49b9-8a9c-b61391867f7a/51afe541-16e1-4e2f-b015-41ce44d23f68.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=LB7kAwp1rgI1g4d3h0Wa%2F20260122%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20260122T074412Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host&X-Amz-Signature=f22bebff66be63eec3abc5895cba2cffccc3e60249c347d1f58d49d46c0a1924',
                            size: '2048x2048'
                        }
                    ],
                    usage: {
                        generated_images: 1,
                        output_tokens: 16280,
                        total_tokens: 16280
                    }
                }
            }

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
                    clientId, // ส่ง clientId ไปให้ Worker
                    body: { ...body, taskId },
                    userId: user.userId,
                    dataImage: res.data.data,
                    usage: res.data.usage,
                },
                {
                    jobId: taskId, // ใช้ taskId เป็น jobId เพื่อให้ track ง่าย
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
                data: {
                    taskId: taskId.toString(),
                    jobId: job.id,
                    message: 'Image generation queued',
                    estimatedImages: res.data.data.length,
                },
            };
        } catch (error) {
            console.error('Error creating generation task:', error);
            this.logError(body.userId, error.message, error.stack, error.response?.data);
            throw error;
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

    private async checkTokenQuota(userId: string, body: CreateGenerateDto, projectMember: any, cacheKey: string): Promise<{ isQuotaExceeded: boolean, currentImageUsed: number, maxImageInPlan: number }> {
        let currentImageUsed = 0;
        const requestImage = body.images || 0;

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
        currentImageUsed = currentImageUsed + requestImage;
        if (currentImageUsed > maxImageInPlan) {
            Logger.error(`Image used ${currentImageUsed + requestImage} exceed max image ${maxImageInPlan}`);
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

    private async prepareGenerationPayload(
        body: CreateGenerateDto,
        modelDetail: any,
        configApi: any
    ) {
        const axiosConfig: AxiosRequestConfig = {
            headers: {
                'Content-Type': configApi.configType,
                Authorization: `${configApi.authorization}`,
            },
            httpsAgent: this.agent,
        };

        let imageUrls: string[] = [];
        if (body.image && body.image.length > 0) {
            try {
                imageUrls = await Promise.all(
                    body.image.map((img) =>
                        this.minioClientSerives.getPresignedUrl(
                            this.minioconfig.minioBucketUpload,
                            img.fileName,
                        ),
                    ),
                );
            } catch (error) {
                throw new Error(`Failed to generate presigned URLs: ${error.message}`);
            }
        }

        const basePayload: any = {
            model: modelDetail.modelType,
            prompt: `create ${body.images || 1} images ${body.text}`,
            response_format: 'url',
            stream: configApi.stream ?? false,
            watermark: configApi.watermark ?? false,
        };

        if (imageUrls.length > 0) {
            basePayload.image = imageUrls.length === 1 ? imageUrls[0] : imageUrls;
        }
        if (body.width && body.height) {
            basePayload.size = `${body.width}x${body.height}`;
        }

        if (body.images && body.images > 1) {
            basePayload.sequential_image_generation = 'auto';
            basePayload.sequential_image_generation_options = {
                max_images: body.images,
            };
        }

        return { basePayload, axiosConfig };
    }

    private async executeGenerationRequest(url: string, payload: any, config: AxiosRequestConfig) {
        console.log({ url, payload, config });
        return await axios.post(url, payload, config);
    }

    private handleGenerationError(error: any) {
        Logger.error(
            `Error generate image: ${error?.response?.data?.error_description || error.message}`,
            error?.response?.data ? JSON.stringify(error.response.data) : error.stack,
        );
        if (axios.isAxiosError(error) && error.response) {
            const { status, data } = error.response;
            const message = data?.errorMessage ||
                data?.error_description ||
                'Failed to generate image';

            throw new HttpException(
                {
                    statusCode: status,
                    message,
                    details: data,
                },
                status,
            );
        }

        throw new InternalServerErrorException('Failed to generate image');
    }

    private async saveGalleryItem(userId: string, body: CreateGenerateDto, uuid: string) {
        return await this.galleryRepo.create({
            data: {
                taskId: body.type === 'image' ? uuid : null,
                projectId: body.projectId,
                userId: userId,
                prompt: body.text,
                typeGenerate: body.type,
                genneratedStatus: 'PENDING',
                imageUrl: '',
                status: false,
                generateConfig: {
                    ...(body?.width && {
                        width: body?.width,
                    }),
                    ...(body?.height && {
                        height: body?.height,
                    }),
                    ...(body?.ratio && {
                        ratio: body?.ratio,
                    }),
                    ...(body?.images && {
                        imageCount: body?.images,
                    }),
                    ...(body?.resolution && {
                        resolution: body?.resolution,
                    }),
                    ...(body?.modelName && {
                        modelName: body?.modelName,
                    }),
                    ...(body?.duration && {
                        duration: body?.duration,
                    }),
                    content: body?.text,
                    ...(body?.generateAudio && {
                        generateAudio: body?.generateAudio,
                    }),
                },
            },
        });
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
