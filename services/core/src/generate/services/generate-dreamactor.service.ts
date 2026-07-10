import {
  GalleryRepository,
  LogRepository,
  MasterdataModelTypeRepository,
  OrganizationRepository,
  QUEUE_NAME_DREAMACTOR,
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

@Injectable()
export class GenerateDreamactorService extends BaseGenerateService {
  constructor(
    generateHelperService: GenerateHelperService,
    galleryRepo: GalleryRepository,
    logrepo: LogRepository,
    masterModelTypeRepo: MasterdataModelTypeRepository,
    @InjectRedis() redis: Redis,
    @InjectQueue(QUEUE_NAME_DREAMACTOR) private readonly dreamactorQueue: Queue,
    organizationRepository: OrganizationRepository,
  ) {
    super(
      generateHelperService,
      galleryRepo,
      logrepo,
      masterModelTypeRepo,
      redis,
      organizationRepository,
    );
  }

  protected get modelType(): string {
    return 'dreamactor';
  }
  protected get queue(): Queue {
    return this.dreamactorQueue;
  }

  protected async checkCreditQuota(
    userId: string,
    body: any,
    projectMember: any,
    cacheKey: string,
    modelDetail: MasterModelTypeDto,
  ): Promise<CreditQuotaResult> {
    return this.defaultCheckCreditQuota(
      userId,
      body,
      projectMember,
      cacheKey,
      modelDetail,
    );
  }

  protected buildQueueJobData(
    taskId: string,
    clientId: string,
    body: any,
    userId: string,
    _apiRes: any,
    modelDetail: MasterModelTypeDto,
    authorization: string | null,
  ): object {
    return {
      taskId,
      clientId,
      body: { ...body },
      userId,
      sendApi: modelDetail.sendApi,
      sendConfig: modelDetail.sendConfig,
      reqKey: modelDetail.modelType,
      dreamactorTaskId: taskId,
      statusBaseUrl: modelDetail?.taskPollApi ?? 'https://cv.byteplusapi.com/',
      // Per-org LLM gateway key — carried for the pending gateway migration
      // (the worker still uses BytePlus HMAC for now).
      authorization,
    };
  }

  protected buildGalleryData(
    taskId: string,
    body: any,
    user: any,
    creditResult: CreditQuotaResult,
  ): object {
    return {
      taskId,
      projectId: body.projectId,
      userId: user.userId,
      prompt: body.prompt,
      imageUrl: '',
      typeGenerate: 'dreamactor',
      genneratedStatus: 'PENDING',
      status: false,
      usedCredit: creditResult.incrementCredit,
      // denormalize metadata จาก log ลง gallery (dual-write)
      tokenUsed: creditResult.onhandToken,
      usedImage: 1,
      ImageUsed: 1,
      generateAudio: body.generateAudio,
      referenceImages:
        body.image.length > 0
          ? body.image.filter((item: any) => item !== null)
          : [],
      resolution: body.resolution,
      generateConfig: this.generateHelperService.buildGenerateConfig({
        ratio: '',
        width: 0,
        height: 0,
        prompt: '',
        duration: body.duration,
        modelName: '',
        imageCount: 0,
        generateAudio: false,
        resolution: '',
      }),
    };
  }

  protected buildLogData(
    taskId: string,
    body: any,
    user: any,
    creditResult: CreditQuotaResult,
  ): object {
    return {
      taskId,
      projectId: body.projectId,
      userId: user.userId,
      prompt: body.prompt || '',
      typeGenerate: 'dreamactor',
      status: 'pending',
      tokenUsed: creditResult.onhandToken,
      usedCredit: creditResult.incrementCredit,
      usedImage: 1,
      ImageUsed: 1,
      generateAudio: body.generateAudio,
      referenceImages:
        body.image.length > 0
          ? body.image.filter((item: any) => item !== null)
          : [],
      resolution: body.resolution,
      generateConfig: this.generateHelperService.buildGenerateConfig({
        ratio: '',
        width: 0,
        height: 0,
        prompt: '',
        duration: body.duration,
        modelName: '',
        imageCount: 0,
        generateAudio: false,
        resolution: '',
      }),
    };
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
      ...super.buildRedisTaskMetadata(taskId, jobId, clientId, userId, body, apiRes),
      dreamactorTaskId: taskId,
    };
  }

  protected async buildReturnResponse(
    taskId: string,
    body: any,
    user: any,
    _apiRes: any,
    _creditResult: CreditQuotaResult,
  ): Promise<object> {
    return {
      taskId,
      projectId: body.projectId,
      userId: user.userId,
      prompt: body.prompt,
      typeGenerate: 'dreamactor',
      genneratedStatus: 'PENDING',
      createdAt: new Date().toISOString(),
      status: false,
      dreamactorTaskId: taskId,
      message: 'Dreamactor generation queued',
      generateConfig: {
        content: body.prompt,
        modelName: body.model,
        imageCount: 0,
        resolution: body.resolution,
        fastMode: body.fastMode,
        seed: body.seed,
      },
      users: {
        fullname: user.fullname,
        userId: user.userId,
        username: user.username,
      },
      referenceImages: [
        ...(body.image[0] ? [body.image[0]] : []),
        ...(body.image[1] ? [body.image[1]] : []),
      ],
      resolution: body.resolution,
      ratio: body.ratio,
      imageUrls: [],
    };
  }

  /** GenerateService delegates here */
  async createDreamactorGenerationTask(body: any, clientId: string) {
    return this.createGenerationTask(body, clientId);
  }
}
