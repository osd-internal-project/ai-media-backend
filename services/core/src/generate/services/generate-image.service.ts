import {
  GalleryRepository,
  LogRepository,
  MasterdataModelTypeRepository,
  QUEUE_NAME_IMAGE,
  ByteplusePayloadImage,
  RequestImageGenerateDto,
  TosService,
  CreditBalanceRepository,
  ProjectRepository,
  MasterModelTypeDto,
} from '@ai-media/share';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { AxiosRequestConfig } from 'axios';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { tosConfigs } from 'src/configs';
import {
  BaseGenerateService,
  CreditQuotaResult,
} from './base-generate.service';
import { GenerateHelperService } from './generate-helper.service';

/** Extract a value from a nested object using a dot-notation path (e.g. "data.task_id") */
function getByPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce((cur: any, key) => cur?.[key], obj);
}

@Injectable()
export class GenerateImageService extends BaseGenerateService {
  /** Holds modelDetail for the current request so extractExternalTaskId can read it */
  private _currentModelDetail: any;

  constructor(
    generateHelperService: GenerateHelperService,
    galleryRepo: GalleryRepository,
    logrepo: LogRepository,
    modeltypeRepo: MasterdataModelTypeRepository,
    @InjectRedis() redis: Redis,
    @InjectQueue(QUEUE_NAME_IMAGE) private readonly imageQueue: Queue,
    private readonly tosService: TosService,
    private readonly projectRepo: ProjectRepository,
    private readonly creditBalanceRepo: CreditBalanceRepository,
  ) {
    super(generateHelperService, galleryRepo, logrepo, modeltypeRepo, redis);
  }

  protected get modelType(): string {
    return 'image';
  }
  protected get queue(): Queue {
    return this.imageQueue;
  }

  /** Image reserves the hold inside checkCreditQuota — base template skips post-log hold update */
  protected get holdReservedInCreditCheck(): boolean {
    return true;
  }

  /** Cancel the hold that was reserved inside checkCreditQuota on error */
  protected async onErrorCancelHold(
    body: any,
    holdCredit: number,
  ): Promise<void> {
    await this.generateHelperService.cancelHoldAmount(
      holdCredit,
      body.userId,
      body.projectId,
    );
  }

  protected extractExternalTaskId(apiRes: any): string | null {
    // NEW: async API — extract task ID using taskResponseMap.taskIdPath from schema
    const taskIdPath = this._currentModelDetail?.taskResponseMap?.taskIdPath;
    if (taskIdPath) return getByPath(apiRes.data, taskIdPath) as string | null;

    // OLD: image API is synchronous, no external task ID
    // return null;
    return null;
  }

  /**
   * Image has extra project-level and org-level credit checks.
   * Also reserves the hold here (not in the main flow).
   */
  protected async checkCreditQuota(
    userId: string,
    body: RequestImageGenerateDto,
    projectMember: any,
    cacheKey: string,
    model: MasterModelTypeDto,
  ): Promise<CreditQuotaResult> {
    try {
      let currentCreditUsed = 0;
      const cachedCreditUsed = cacheKey ? await this.redis.get(cacheKey) : null;

      currentCreditUsed = cachedCreditUsed
        ? parseInt(cachedCreditUsed, 10)
        : projectMember.holdCreditAllowance + projectMember.usedCreditAllowance;

      const credit = await this.generateHelperService.getUsedCredit(
        0,
        body,
        model,
      );
      if (!credit) {
        return {
          isQuotaExceeded: true,
          incrementCredit: 0,
          limitAllowance: 0,
          usedCredit: 0,
          onhandToken: 0,
        };
      }

      const maxCreditInPlan = projectMember?.limitCreditAllowance || 0;
      currentCreditUsed = currentCreditUsed + credit.credit;

      if (currentCreditUsed > maxCreditInPlan) {
        Logger.error(
          `Credit used ${currentCreditUsed} exceed max credit ${maxCreditInPlan}`,
        );
        return {
          isQuotaExceeded: true,
          incrementCredit: credit.credit,
          limitAllowance: maxCreditInPlan,
          usedCredit: currentCreditUsed,
          onhandToken: 0,
        };
      }

      const project = await this.projectRepo.findOne({
        where: { id: body.projectId },
      });
      if (
        project.usedCreditAllowance + project.holdCreditAllowance >
        project.limitCreditAllowance
      ) {
        Logger.error(
          `Project Credit used ${
            project.usedCreditAllowance + project.holdCreditAllowance
          } exceed max credit ${project.limitCreditAllowance}`,
        );
        return {
          isQuotaExceeded: true,
          incrementCredit: credit.credit,
          limitAllowance: maxCreditInPlan,
          usedCredit: currentCreditUsed,
          onhandToken: 0,
        };
      }

      const creditBalance = await this.creditBalanceRepo.findOne({
        where: { organizationId: body.organizationId },
      });
      if (
        creditBalance.currentCycleBalance + creditBalance.onTopBalance <
        credit.credit
      ) {
        Logger.error(
          `Credit Balance ${
            creditBalance.currentCycleBalance + creditBalance.onTopBalance
          } insufficient for ${credit.credit}`,
        );
        return {
          isQuotaExceeded: true,
          incrementCredit: credit.credit,
          limitAllowance: maxCreditInPlan,
          usedCredit: currentCreditUsed,
          onhandToken: 0,
        };
      }

      // Reserve hold immediately (image pattern — base template skips post-log hold update)
      await this.generateHelperService.updateHoldCreditBalance(
        userId,
        body.organizationId,
        body.projectId,
        'credit',
        credit.credit,
      );

      return {
        isQuotaExceeded: false,
        incrementCredit: credit.credit,
        limitAllowance: maxCreditInPlan,
        usedCredit: currentCreditUsed,
        onhandToken: 0,
      };
    } catch (e) {
      Logger.error(e);
      return {
        isQuotaExceeded: true,
        incrementCredit: 0,
        limitAllowance: 0,
        usedCredit: 0,
        onhandToken: 0,
      };
    }
  }

  protected async buildPayload(
    body: RequestImageGenerateDto,
    modelDetail: any,
  ): Promise<{ basePayload: any; axiosConfig: AxiosRequestConfig }> {
    // Store for extractExternalTaskId — called by the base template after buildPayload
    this._currentModelDetail = modelDetail;

    const axiosConfig: AxiosRequestConfig = {
      headers: {
        'Content-Type': modelDetail.sendConfig.configType,
        Authorization: `${modelDetail.sendConfig.authorization}`,
      },
      httpsAgent: this.agent,
    };

    // หา builder จาก modelType prefix (เช่น "seedream-4-5-251128" → "seedream")
    const matchedKey = modelDetail.sendConfig.type;
    const builder = this.payloadBuilders[matchedKey];
    const basePayload = await builder(body, modelDetail);
    return { basePayload, axiosConfig };
  }

  protected buildQueueJobData(
    taskId: string,
    clientId: string,
    body: any,
    userId: string,
    apiRes: any,
    modelDetail: any,
  ): object {
    const isAsync = !!modelDetail?.taskPollApi;

    // NEW: async API — pass poll config to worker; dataImage is empty (worker will fetch via poll)
    // OLD: return { taskId, clientId, body: { ...body }, userId, dataImage: apiRes.data.data, usage: apiRes.data.usage };
    return {
      taskId,
      clientId,
      body: { ...body },
      userId,
      dataImage: isAsync ? [] : apiRes.data.data,
      usage: apiRes.data.usage ?? {},
      ...(isAsync && {
        externalTaskId: taskId,
        taskPollApi: modelDetail.taskPollApi,
        taskPollSec: modelDetail.taskPollSec ?? 10,
        taskResponseMap: modelDetail.taskResponseMap,
        sendConfig: modelDetail.sendConfig,
      }),
    };
  }

  /** Image worker handles gallery/log creation — skip them here */
  protected buildGalleryData(): any {
    return null;
  }
  protected buildLogData(): any {
    return null;
  }

  protected buildRedisTaskMetadata(
    taskId: string,
    jobId: string | undefined,
    clientId: string,
    userId: string,
    body: any,
    apiRes: any,
  ): object {
    return {
      ...super.buildRedisTaskMetadata(
        taskId,
        jobId,
        clientId,
        userId,
        body,
        apiRes,
      ),
      totalImages: apiRes.data.data.length,
    };
  }

  protected async buildReturnResponse(
    taskId: string,
    body: RequestImageGenerateDto,
    user: any,
    apiRes: any,
    _creditResult: CreditQuotaResult,
  ): Promise<object> {
    let referenceImages: string[] = [];
    if (body.image && body.image.length > 0) {
      referenceImages = await Promise.all(
        body.image.map((img) =>
          this.tosService.getPreSignedUrl(tosConfigs().tosBucket, img),
        ),
      );
    }

    return {
      taskId,
      projectId: body.projectId,
      userId: user.userId,
      prompt: body.prompt,
      imageUrl: apiRes.data.data,
      typeGenerate: 'image',
      genneratedStatus: 'SUCCESS',
      status: true,
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
        24 * 60 * 60,
      );

      console.log(`🚫 Task cancelled: ${taskId}`);
      return { success: true, message: 'Task cancelled successfully' };
    } catch (error: any) {
      console.error('Error cancelling task:', error);
      return { success: false, message: error.message };
    }
  }
  // map ชื่อ model (prefix) → payload builder function
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
          body.image.map(
            async (img) =>
              await this.tosService.getPreSignedUrl(
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
      stream: modelDetail.sendConfig.stream ?? false,
      watermark: modelDetail.sendConfig.watermark ?? false,
      sequential_image_generation: body.sequentialImageGeneration,
      ...(images && images.length > 0 && { image: images }),
      ...(body.maxImages && {
        sequential_image_generation_options: { max_images: body.maxImages },
      }),
    };
  }
}
