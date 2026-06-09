import {
  GalleryRepository,
  LogRepository,
  MasterdataModelTypeRepository,
  QUEUE_NAME_IMAGE,
  RequestImageGenerateDto,
  TosService,
  CreditBalanceRepository,
  ProjectRepository,
  MasterModelTypeDto,
} from '@ai-media/share';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { tosConfigs } from 'src/configs';
import {
  BaseGenerateService,
  CreditQuotaResult,
} from './base-generate.service';
import { GenerateHelperService } from './generate-helper.service';

@Injectable()
export class GenerateImageService extends BaseGenerateService {
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

  /** API call happens in the worker — no external task ID to extract here */
  protected extractExternalTaskId(_apiRes: any): string | null {
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

  protected buildQueueJobData(
    taskId: string,
    clientId: string,
    body: any,
    userId: string,
    _apiRes: any,
    modelDetail: any,
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
    _apiRes: any,
  ): object {
    return {
      ...super.buildRedisTaskMetadata(taskId, jobId, clientId, userId, body, _apiRes),
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
        24 * 60 * 60,
      );

      console.log(`🚫 Task cancelled: ${taskId}`);
      return { success: true, message: 'Task cancelled successfully' };
    } catch (error: any) {
      console.error('Error cancelling task:', error);
      return { success: false, message: error.message };
    }
  }
}
