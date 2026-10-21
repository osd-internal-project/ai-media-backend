import {
  GalleryRepository,
  LlmGatewayService,
  LogRepository,
  MasterdataModelTypeRepository,
  OrganizationRepository,
  QUEUE_NAME_IMAGE,
  RequestImageGenerateDto,
  MasterModelTypeDto,
} from '@ai-media/share';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import {
  BaseGenerateService,
  CreditQuotaResult,
} from './base-generate.service';
import { GenerateHelperService } from './generate-helper.service';
import { Span } from 'nestjs-otel';

@Injectable()
export class GenerateImageService extends BaseGenerateService {
  constructor(
    generateHelperService: GenerateHelperService,
    galleryRepo: GalleryRepository,
    logrepo: LogRepository,
    masterModelTypeRepo: MasterdataModelTypeRepository,
    @InjectRedis() redis: Redis,
    @InjectQueue(QUEUE_NAME_IMAGE) private readonly imageQueue: Queue,
    organizationRepository: OrganizationRepository,
    llmGateway: LlmGatewayService,
  ) {
    super(
      generateHelperService,
      galleryRepo,
      logrepo,
      masterModelTypeRepo,
      redis,
      organizationRepository,
      llmGateway,
    );
  }

  protected get modelType(): string {
    return 'image';
  }
  protected get usesLlmGateway(): boolean {
    return true;
  }
  protected get queue(): Queue {
    return this.imageQueue;
  }

  /** API call happens in the worker — no external task ID to extract here */
  protected extractExternalTaskId(_apiRes: any): string | null {
    return null;
  }

  @Span()
  protected async checkCreditQuota(
    userId: string,
    body: RequestImageGenerateDto,
    projectMember: any,
    cacheKey: string,
    model: MasterModelTypeDto,
  ): Promise<CreditQuotaResult> {
    return this.defaultCheckCreditQuota(
      userId,
      body,
      projectMember,
      cacheKey,
      model,
    );
  }

  protected buildQueueJobData(
    taskId: string,
    clientId: string,
    body: any,
    userId: string,
    _apiRes: any,
    modelDetail: any,
    authorization: string | null,
  ): object {
    return {
      taskId,
      clientId,
      body: { ...body },
      userId,
      sendApi: modelDetail.sendApi,
      sendConfig: modelDetail.sendConfig,
      taskPollApi: modelDetail.taskPollApi ?? null,
      taskPollSec: modelDetail.taskPollSec ?? 10,
      taskResponseMap: modelDetail.taskResponseMap ?? null,
      // Per-org LLM gateway key (falls back to the model's configured token).
      authorization:
        authorization ?? modelDetail?.sendConfig?.authorization ?? null,
    };
  }

  /**
   * สร้าง gallery PENDING ตั้งแต่ submit — refresh ระหว่างรอจะยังเห็น task (worker update เป็น SUCCESS/FAILED)
   * usedCredit = hold ไว้ให้ sweeper ของ worker คืนได้ถ้างานค้าง
   */
  protected buildGalleryData(
    taskId: string,
    body: RequestImageGenerateDto,
    user: any,
    creditResult: CreditQuotaResult,
  ): object {
    return {
      taskId,
      projectId: body.projectId,
      userId: user.userId,
      prompt: body.prompt,
      imageUrl: '',
      resultUrl: [],
      typeGenerate: 'image',
      genneratedStatus: 'PENDING',
      status: false,
      usedCredit: creditResult.incrementCredit,
      tokenUsed: 0,
      ImageUsed: 0,
      resolution: body.resolution,
      ratio: body.ratio,
      generateAudio: false,
      // ค่าเดียวกับที่ worker เก็บ (body.image) เพื่อให้ reader เดิมอ่านเหมือนเดิม
      referenceImages: body.image?.length > 0 ? body.image : [],
      generateConfig: this.generateHelperService.buildGenerateConfig({
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
    };
  }
  /** Image worker handles log creation — skip it here */
  protected buildLogData(): any {
    return null;
  }

  protected buildRedisTaskMetadata(
    taskId: string,
    jobId: string | undefined,
    clientId: string,
    userId: string,
    body: any,
    _apiRes: any,
  ): object {
    return {
      ...super.buildRedisTaskMetadata(
        taskId,
        jobId,
        clientId,
        userId,
        body,
        _apiRes,
      ),
      totalImages: null,
    };
  }

  protected async buildReturnResponse(
    taskId: string,
    body: RequestImageGenerateDto,
    user: any,
    _apiRes: any,
    _creditResult: CreditQuotaResult,
  ): Promise<object> {
    // response ส่ง URL เสมอ — frontend เอาไปใส่ <img src> ตรง ๆ
    // (toDisplayUrl มี guard ให้ค่าที่เป็น URL อยู่แล้ว เช่น reference จาก workflow ผ่านไปตรง ๆ)
    const referenceImages =
      await this.generateHelperService.toReferenceDisplayUrls(
        this.generateHelperService.collectReferenceKeys(body),
      );

    return {
      taskId,
      projectId: body.projectId,
      userId: user.userId,
      prompt: body.prompt,
      imageUrl: [],
      typeGenerate: 'image',
      genneratedStatus: 'PENDING',
      status: false,
      generateConfig: this.generateHelperService.buildGenerateConfig({
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
      users: {
        fullname: user.fullname,
        userId: user.userId,
        username: user.username,
      },
      referenceImages,
      resolution: body.resolution,
      ratio: body.ratio,
      imageUrls: [],
    };
  }

  /** GenerateService delegates here */
  async createImageGenerationTask(
    body: RequestImageGenerateDto,
    clientId: string,
  ) {
    return this.createGenerationTask(body, clientId);
  }

  async getTaskStatus(taskId: string) {
    const taskData = await this.redis.get(`task:${taskId}`);
    if (!taskData) return { status: 'not_found' };

    const task = JSON.parse(taskData);
    const job = await this.imageQueue.getJob(task.jobId);
    if (!job) return { status: 'not_found' };

    const state = await job.getState();
    const progress = job.progress || {};

    return {
      taskId,
      jobId: task.jobId,
      status: state,
      progress,
      createdAt: task.createdAt,
      totalImages: task.totalImages,
      ...(state === 'completed' && { result: job.returnvalue }),
      ...(state === 'failed' && {
        error: job.failedReason,
        attempts: job.attemptsMade,
      }),
    };
  }

  async cancelTask(taskId: string) {
    try {
      const taskData = await this.redis.get(`task:${taskId}`);
      if (!taskData) return { success: false, message: 'Task not found' };

      const task = JSON.parse(taskData);
      const job = await this.imageQueue.getJob(task.jobId);
      if (!job) return { success: false, message: 'Job not found' };

      const state = await job.getState();
      if (state === 'completed' || state === 'failed') {
        return { success: false, message: `Job already ${state}` };
      }

      await job.remove();

      task.status = 'cancelled';
      task.cancelledAt = new Date().toISOString();
      await this.redis.set(
        `task:${taskId}`,
        JSON.stringify(task),
        'EX',
        60 * 60,
      );

      console.log(`🚫 Task cancelled: ${taskId}`);
      return { success: true, message: 'Task cancelled successfully' };
    } catch (error: any) {
      console.error('Error cancelling task:', error);
      return { success: false, message: error.message };
    }
  }
}
