import {
  GalleryRepository,
  LlmGatewayService,
  LogRepository,
  MasterdataModelTypeRepository,
  OrganizationRepository,
  QUEUE_NAME_OMNIHUMEN,
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
export class GenerateOmnihumanService extends BaseGenerateService {
  constructor(
    generateHelperService: GenerateHelperService,
    galleryRepo: GalleryRepository,
    logrepo: LogRepository,
    masterModelTypeRepo: MasterdataModelTypeRepository,
    @InjectRedis() redis: Redis,
    @InjectQueue(QUEUE_NAME_OMNIHUMEN) private readonly omnihumenQueue: Queue,
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
    return 'omnihumen';
  }
  protected get queue(): Queue {
    return this.omnihumenQueue;
  }

  @Span()
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
      omnihumenTaskId: taskId,
      statusBaseUrl: modelDetail?.taskPollApi ?? 'https://cv.byteplusapi.com/',
      // Per-org LLM gateway key — carried for the pending gateway migration
      // (the worker still uses BytePlus HMAC for now).
      authorization,
      modelOptions: {
        resolution: (modelDetail as any).resolution,
        seed: (modelDetail as any).seed,
        fastMode: (modelDetail as any).fastMode,
      },
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
      typeGenerate: 'omnihumen',
      genneratedStatus: 'PENDING',
      status: false,
      usedCredit: creditResult.incrementCredit,
      usedImage: 1,
      // denormalize metadata จาก log ลง gallery (dual-write)
      tokenUsed: creditResult.onhandToken,
      ImageUsed: 1,
      generateAudio: body.generateAudio,
      // เก็บเป็น object key เสมอ (presigned URL หมดอายุ)
      referenceImages: this.generateHelperService.collectReferenceKeys(body),
      resolution: body.resolution,
      generateConfig: this.generateHelperService.buildGenerateConfig({
        resolution: body.resolution,
        seed: body.seed,
        fastMode: body.fastMode,
        ratio: '',
        width: 0,
        height: 0,
        prompt: '',
        duration: body.duration,
        modelName: '',
        imageCount: 0,
        generateAudio: false,
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
      typeGenerate: 'omnihumen',
      status: 'pending',
      tokenUsed: creditResult.onhandToken,
      usedCredit: creditResult.incrementCredit,
      usedImage: 1,
      ImageUsed: 1,
      generateAudio: body.generateAudio,
      // เก็บเป็น object key เสมอ (presigned URL หมดอายุ)
      referenceImages: this.generateHelperService.collectReferenceKeys(body),
      resolution: body.resolution,
      generateConfig: this.generateHelperService.buildGenerateConfig({
        resolution: body.resolution,
        seed: body.seed,
        fastMode: body.fastMode,
        ratio: '',
        width: 0,
        height: 0,
        prompt: '',
        duration: body.duration,
        modelName: '',
        imageCount: 0,
        generateAudio: false,
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
      ...super.buildRedisTaskMetadata(
        taskId,
        jobId,
        clientId,
        userId,
        body,
        apiRes,
      ),
      omnihumenTaskId: taskId,
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
      typeGenerate: 'omnihumen',
      genneratedStatus: 'PENDING',
      createdAt: new Date().toISOString(),
      status: false,
      omnihumenTaskId: taskId,
      message: 'Omnihumen generation queued',
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
      // response ส่ง URL เสมอ — frontend เอาไปใส่ <img src> ตรง ๆ
      referenceImages: await this.generateHelperService.toReferenceDisplayUrls(
        this.generateHelperService.collectReferenceKeys(body),
      ),
      resolution: body.resolution,
      ratio: body.ratio,
      imageUrls: [],
    };
  }

  /** GenerateService delegates here */
  async createOmnihumenGenerationTask(body: any, clientId: string) {
    return this.createGenerationTask(body, clientId);
  }
}
