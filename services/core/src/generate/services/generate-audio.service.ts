import {
  GalleryRepository,
  LlmGatewayService,
  LogRepository,
  MasterdataModelTypeRepository,
  OrganizationRepository,
  QUEUE_NAME_AUDIO,
  MasterModelTypeDto,
  RequestAudioGenerateDto,
  validateAudioRequest,
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
export class GenerateAudioService extends BaseGenerateService {
  constructor(
    generateHelperService: GenerateHelperService,
    galleryRepo: GalleryRepository,
    logrepo: LogRepository,
    masterModelTypeRepo: MasterdataModelTypeRepository,
    @InjectRedis() redis: Redis,
    @InjectQueue(QUEUE_NAME_AUDIO) private readonly audioQueue: Queue,
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
    return 'audio';
  }
  protected get queue(): Queue {
    return this.audioQueue;
  }
  protected get usesLlmGateway(): boolean {
    return true;
  }
  protected getCreditCacheKeyPrefix(): string {
    return 'audio_used';
  }

  @Span()
  protected async checkCreditQuota(
    userId: string,
    body: RequestAudioGenerateDto,
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
    body: RequestAudioGenerateDto,
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
      statusBaseUrl: modelDetail.taskPollApi ?? null,
      authorization:
        authorization ?? modelDetail?.sendConfig?.authorization ?? null,
    };
  }

  private buildAudioConfig(body: RequestAudioGenerateDto) {
    return {
      content: body.prompt,
      modelName: body.model,
      format: body.format,
      ...(body.sampleRate && { sampleRate: body.sampleRate }),
      ...(body.speechRate && { speechRate: body.speechRate }),
      ...(body.loudnessRate && { loudnessRate: body.loudnessRate }),
      ...(body.pitchRate && { pitchRate: body.pitchRate }),
      ...(body.enableSubtitle && { enableSubtitle: true }),
      ...(body.references?.length && { references: body.references }),
    };
  }

  protected buildGalleryData(
    taskId: string,
    body: RequestAudioGenerateDto,
    user: any,
    creditResult: CreditQuotaResult,
  ): object {
    return {
      taskId,
      projectId: body.projectId,
      userId: user.userId,
      prompt: body.prompt,
      imageUrl: '',
      typeGenerate: 'audio',
      genneratedStatus: 'PENDING',
      status: false,
      usedCredit: creditResult.incrementCredit,
      tokenUsed: creditResult.onhandToken,
      usedImage: 0,
      ImageUsed: 0,
      // เก็บเป็น object key เสมอ (presigned URL หมดอายุ)
      referenceImages: this.generateHelperService.collectReferenceKeys(body),
      generateConfig: this.buildAudioConfig(body),
    };
  }

  protected buildLogData(
    taskId: string,
    body: RequestAudioGenerateDto,
    user: any,
    creditResult: CreditQuotaResult,
  ): object {
    return {
      taskId,
      projectId: body.projectId,
      userId: user.userId,
      prompt: body.prompt,
      typeGenerate: 'audio',
      status: 'pending',
      tokenUsed: creditResult.onhandToken,
      usedCredit: creditResult.incrementCredit,
      usedImage: 0,
      ImageUsed: 0,
      referenceImages: this.generateHelperService.collectReferenceKeys(body),
      generateConfig: this.buildAudioConfig(body),
    };
  }

  protected async buildReturnResponse(
    taskId: string,
    body: RequestAudioGenerateDto,
    user: any,
    _apiRes: any,
    creditResult: CreditQuotaResult,
  ): Promise<object> {
    return {
      taskId,
      projectId: body.projectId,
      userId: user.userId,
      prompt: body.prompt,
      typeGenerate: 'audio',
      genneratedStatus: 'QUEUED',
      createdAt: new Date().toISOString(),
      status: false,
      message: 'Audio generation queued',
      usedCredit: creditResult.incrementCredit,
      generateConfig: this.buildAudioConfig(body),
      users: {
        fullname: user.fullname,
        userId: user.userId,
        username: user.username,
      },
      // response ส่ง URL เสมอ — frontend เอาไปใส่ <img src> ตรง ๆ
      referenceImages: await this.generateHelperService.toReferenceDisplayUrls(
        this.generateHelperService.collectReferenceKeys(body),
      ),
      imageUrls: [],
    };
  }

  /** GenerateService delegates here — ตรวจ payload ก่อนเข้า flow เครดิต */
  async createAudioGenerationTask(
    body: RequestAudioGenerateDto,
    clientId: string,
  ) {
    const invalid = validateAudioRequest(body);
    if (invalid) return { status: 400, data: invalid };
    return this.createGenerationTask(body, clientId);
  }
}
