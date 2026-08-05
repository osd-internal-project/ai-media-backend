import {
  GalleryRepository,
  LlmGatewayService,
  LogRepository,
  MasterdataModelTypeRepository,
  MasterModelTypeDto,
  OrganizationRepository,
} from '@ai-media/share';
import { Logger } from '@nestjs/common';
import { AxiosRequestConfig } from 'axios';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { GenerateHelperService } from './generate-helper.service';

export interface CreditQuotaResult {
  isQuotaExceeded: boolean;
  /** Credit amount reserved for this generation */
  incrementCredit: number;
  limitAllowance: number;
  usedCredit: number;
  onhandToken: number;
}

/**
 * Template method base for all generation types (video, image, omni, dreamactor).
 * Subclasses implement type-specific payload building and credit checking;
 * the common validate → find-model → check-credit → call-API → queue → redis flow
 * lives here once.
 */
export abstract class BaseGenerateService {
  constructor(
    protected readonly generateHelperService: GenerateHelperService,
    protected readonly galleryRepo: GalleryRepository,
    protected readonly logrepo: LogRepository,
    protected readonly masterModelTypeRepo: MasterdataModelTypeRepository,
    protected readonly redis: Redis,
    protected readonly organizationRepository: OrganizationRepository,
    protected readonly llmGateway: LlmGatewayService,
  ) {}

  // ── Must override ────────────────────────────────────────────────────────────

  /** Prisma model type string, e.g. 'video', 'image', 'omnihumen', 'dreamactor' */
  protected abstract get modelType(): string;

  /**
   * Whether this generation type authenticates through the LLM gateway with the
   * organization's per-org key. When true, a missing key fails the request.
   * Override → true in gateway-backed types (image, video).
   */
  protected get usesLlmGateway(): boolean {
    return false;
  }

  /** BullMQ queue for this generation type */
  protected abstract get queue(): Queue;

  /**
   * Payload building has moved to each worker processor.
   * This stub exists only to satisfy TypeScript — it is never called.
   */
  protected async buildPayload(
    _body: any,
    _modelDetail: any,
  ): Promise<{ basePayload: any; axiosConfig: AxiosRequestConfig }> {
    throw new Error(
      'buildPayload must not be called in core — API call happens in worker',
    );
  }

  /** Credit quota check — logic differs significantly per type */
  protected abstract checkCreditQuota(
    userId: string,
    body: any,
    projectMember: any,
    cacheKey: string,
    modelDetail: MasterModelTypeDto,
  ): Promise<CreditQuotaResult>;

  /** Job data stored in BullMQ — differs per type */
  protected abstract buildQueueJobData(
    taskId: string,
    clientId: string,
    body: any,
    userId: string,
    apiRes: any,
    modelDetail: any,
    authorization: string | null,
  ): any;

  /** Gallery row data; return null to skip gallery creation (image pattern) */
  protected abstract buildGalleryData(
    taskId: string,
    body: any,
    user: any,
    creditResult: CreditQuotaResult,
  ): any;

  /** Log row data; return null to skip log creation (image pattern) */
  protected abstract buildLogData(
    taskId: string,
    body: any,
    user: any,
    creditResult: CreditQuotaResult,
  ): any;

  /** Shape of the { status: 200, data: ... } response */
  protected abstract buildReturnResponse(
    taskId: string,
    body: any,
    user: any,
    apiRes: any,
    creditResult: CreditQuotaResult,
  ): Promise<object>;

  // ── Can override (have defaults) ─────────────────────────────────────────────

  /** Redis cache key suffix; override to 'video_used' for video */
  protected getCreditCacheKeyPrefix(): string {
    return 'credit_used';
  }

  /** Token passed to getUsedCredit; video overrides with frame-rate formula */
  protected calculateCreditToken(_body: any): number {
    return 0;
  }

  /**
   * Extract the external task ID from the API response.
   * Default tries res.data.data.task_id then res.data.id.
   * Return null to keep body.taskId unchanged (image pattern).
   */
  protected extractExternalTaskId(apiRes: any): string | null {
    return apiRes?.data?.data?.task_id ?? apiRes?.data?.id ?? null;
  }

  /** Base Redis task metadata — override to add type-specific fields */
  protected buildRedisTaskMetadata(
    taskId: string,
    jobId: string | undefined,
    clientId: string,
    userId: string,
    body: any,
    _apiRes: any,
  ): object {
    return {
      taskId,
      jobId,
      clientId,
      userId,
      projectId: body.projectId,
      status: 'queued',
      type: this.modelType,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * True when checkCreditQuota already reserves the hold internally (image).
   * The template skips the post-log updateHoldCreditBalance call in that case.
   */
  protected get holdReservedInCreditCheck(): boolean {
    return false;
  }

  /**
   * When true, the template skips buildPayload + axios.post so the external API
   * is called inside the worker processor instead (respects queue concurrency).
   * Only image overrides this to return true.
   */
  // protected get deferApiCallToWorker(): boolean {
  //   return false;
  // }

  /** Called in the catch block to undo a reserved credit hold on error */
  protected async onErrorCancelHold(
    _body: any,
    _holdCredit: number,
  ): Promise<void> {}

  /**
   * Default credit quota check — used by video, omni, and dreamactor.
   * Image overrides checkCreditQuota completely due to extra project/org checks.
   */
  protected async defaultCheckCreditQuota(
    _userId: string,
    body: any,
    projectMember: any,
    cacheKey: string,
    modelDetail: MasterModelTypeDto,
  ): Promise<CreditQuotaResult> {
    let currentCreditUsed = 0;
    const cachedCreditUsed = cacheKey ? await this.redis.get(cacheKey) : null;

    currentCreditUsed = cachedCreditUsed
      ? parseInt(cachedCreditUsed, 10)
      : projectMember.holdCreditAllowance + projectMember.usedCreditAllowance;

    const token = this.calculateCreditToken(body);
    const onhandCredit = await this.generateHelperService.getUsedCredit(
      token,
      body,
      modelDetail,
    );

    if (!onhandCredit) {
      return {
        isQuotaExceeded: true,
        incrementCredit: 0,
        limitAllowance: 0,
        usedCredit: 0,
        onhandToken: 0,
      };
    }

    const usedCredit = currentCreditUsed + onhandCredit.credit || 0;
    const limitAllowance = projectMember.limitCreditAllowance || 0;

    if (usedCredit > limitAllowance) {
      Logger.error(
        `Token used ${usedCredit} exceed max credit ${limitAllowance}`,
      );
      return {
        isQuotaExceeded: true,
        incrementCredit: onhandCredit.credit,
        limitAllowance,
        usedCredit,
        onhandToken: onhandCredit.token,
      };
    }

    return {
      isQuotaExceeded: false,
      incrementCredit: onhandCredit.credit,
      limitAllowance,
      usedCredit,
      onhandToken: onhandCredit.token,
    };
  }

  // ── Template method ───────────────────────────────────────────────────────────

  async createGenerationTask(
    body: any,
    clientId: string,
  ): Promise<{ status: number; data: any }> {
    let taskId: string = body.taskId;
    let holdCredit = 0;
    const cacheKey = `${body.organizationId}/${
      body.projectId
    }/${this.getCreditCacheKeyPrefix()}_${body.userId}`;

    try {
      const { user, projectMember } =
        await this.generateHelperService.validateUserAndProject(
          body.userId,
          body.projectId,
        );

      if (!projectMember) return { status: 400, data: 'Team member not found' };
      if (user)
        await this.generateHelperService.logAudit(
          user.userId,
          'CREATE',
          body,
          taskId,
        );

      const modelDetail = await this.masterModelTypeRepo.findOne({
        where: { modelType: body.model, type: this.modelType, isActive: true },
      });
      if (!modelDetail) return { status: 400, data: 'Model not found' };

      // Resolve the org's LLM gateway key BEFORE reserving credit, so a missing
      // key fails cleanly without leaving an orphaned credit hold. Gateway-backed
      // types (image/video) require it; others carry it for a future migration.
      const authorization = await this.llmGateway.getOrCreateApiKey(
        body.organizationId,
      );
      if (this.usesLlmGateway && !authorization) {
        return { status: 500, data: 'generate failed' };
      }

      const creditResult = await this.checkCreditQuota(
        user.userId,
        body,
        projectMember,
        cacheKey,
        modelDetail,
      );
      holdCredit = creditResult.incrementCredit;

      if (creditResult.isQuotaExceeded) {
        return {
          status: 400,
          data: `Token used ${creditResult.usedCredit} exceed max credit ${creditResult.limitAllowance}`,
        };
      }

      let apiRes: any = undefined;
      // if (!this.deferApiCallToWorker) {
      //   const { basePayload, axiosConfig } = await this.buildPayload(
      //     body,
      //     modelDetail,
      //   );
      //   Logger.debug('basePayload', basePayload);
      //   console.log('axiosConfig', axiosConfig);
      //   console.log('Calling external API with payload:', basePayload);
      //   apiRes = await axios.post(
      //     modelDetail.sendApi,
      //     basePayload,
      //     axiosConfig,
      //   );

      //   const externalTaskId = this.extractExternalTaskId(apiRes);
      //   if (externalTaskId) taskId = externalTaskId;
      // }

      const galleryData = this.buildGalleryData(
        taskId,
        body,
        user,
        creditResult,
      );
      if (galleryData) await this.galleryRepo.create({ data: galleryData });

      const logData = this.buildLogData(taskId, body, user, creditResult);
      const log = logData ? await this.logrepo.create({ data: logData }) : null;

      if (log && !this.holdReservedInCreditCheck) {
        await this.generateHelperService.updateHoldCreditBalance(
          user.userId,
          body.organizationId,
          body.projectId,
          'credit',
          creditResult.incrementCredit,
        );
      }

      await this.redis.set(
        cacheKey,
        creditResult.usedCredit.toString(),
        'EX',
        60 * 60,
      );

      const job = await this.queue.add(
        this.modelType,
        this.buildQueueJobData(
          taskId,
          clientId,
          body,
          user.userId,
          apiRes,
          modelDetail,
          authorization,
        ),
        {
          jobId: taskId,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
      );

      await this.redis.set(
        `task:${taskId}`,
        JSON.stringify(
          this.buildRedisTaskMetadata(
            taskId,
            job.id,
            clientId,
            user.userId,
            body,
            apiRes,
          ),
        ),
        'EX',
        60 * 60,
      );

      console.log(
        `✅ ${this.modelType} Task created: ${taskId}, Job ID: ${job.id}`,
      );

      return {
        status: 200,
        data: await this.buildReturnResponse(
          taskId,
          body,
          user,
          apiRes,
          creditResult,
        ),
      };
    } catch (error) {
      console.error(`Error creating ${this.modelType} generation task:`, error);
      await this.onErrorCancelHold(body, holdCredit);
      this.generateHelperService.handleGenerationError(error, body.userId);
      throw error;
    }
  }
}
