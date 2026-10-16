import {
  GalleryRepository,
  LlmGatewayService,
  LogRepository,
  MasterdataModelTypeRepository,
  OrganizationRepository,
  QUEUE_NAME_VDO,
  RequestVideoGenerateDto,
  MasterModelTypeDto,
  VIDEO_INFLIGHT_DATA_KEY,
  VIDEO_INFLIGHT_KEY,
  VideoInflightData,
} from '@ai-media/share';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import {
  BaseGenerateService,
  CreditQuotaResult,
} from './base-generate.service';
import { GenerateHelperService } from './generate-helper.service';
import { Span } from 'nestjs-otel';

@Injectable()
export class GenerateVideoService extends BaseGenerateService {
  private readonly logger = new Logger(GenerateVideoService.name);

  constructor(
    generateHelperService: GenerateHelperService,
    galleryRepo: GalleryRepository,
    logrepo: LogRepository,
    masterModelTypeRepo: MasterdataModelTypeRepository,
    @InjectRedis() redis: Redis,
    @InjectQueue(QUEUE_NAME_VDO) private readonly videoQueue: Queue,
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
    return 'video';
  }
  protected get usesLlmGateway(): boolean {
    return true;
  }
  protected get queue(): Queue {
    return this.videoQueue;
  }

  protected getCreditCacheKeyPrefix(): string {
    return 'video_used';
  }

  /**
   * ลงทะเบียนงานให้ sweeper ของ worker ปิดได้ถ้าไม่มีใครปิด
   * ห้าม throw — job เข้าคิวไปแล้ว ถ้า throw ตรงนี้ catch ของ base จะคืน hold เครดิตทั้งที่งานยังวิ่ง
   */
  @Span()
  protected async afterEnqueue(
    taskId: string,
    clientId: string,
    userId: string,
    body: RequestVideoGenerateDto,
  ): Promise<void> {
    const data: VideoInflightData = {
      clientId,
      userId,
      organizationId: body.organizationId,
      projectId: body.projectId,
    };
    try {
      await this.redis
        .multi()
        .zadd(VIDEO_INFLIGHT_KEY, Date.now(), taskId)
        .hset(VIDEO_INFLIGHT_DATA_KEY, taskId, JSON.stringify(data))
        .exec();
    } catch (error) {
      this.logger.error(
        `[video][${taskId}] register inflight failed — sweeper will not cover this task: ${
          (error as Error).message
        }`,
      );
    }
  }

  protected calculateCreditToken(body: RequestVideoGenerateDto): number {
    return (body.width * body.height * body.duration * 24) / 1024;
  }

  @Span()
  protected async checkCreditQuota(
    userId: string,
    body: RequestVideoGenerateDto,
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
    apiRes: any,
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
      statusBaseUrl: modelDetail?.taskPollApi ?? null,
      videoTaskId: apiRes?.data?.id ?? null,
      // Per-org LLM gateway key (falls back to the model's configured token).
      authorization:
        authorization ?? modelDetail?.sendConfig?.authorization ?? null,
    };
  }

  protected buildGalleryData(
    taskId: string,
    body: RequestVideoGenerateDto,
    user: any,
    creditResult: CreditQuotaResult,
  ): object {
    return {
      taskId,
      projectId: body.projectId,
      userId: user.userId,
      prompt: body.prompt,
      imageUrl: '',
      typeGenerate: 'video',
      genneratedStatus: 'PENDING',
      status: false,
      usedCredit: creditResult.incrementCredit,
      // denormalize metadata จาก log ลง gallery (dual-write)
      tokenUsed: creditResult.onhandToken,
      usedImage: 1,
      ImageUsed: 1,
      generateAudio: body.generateAudio,
      // เก็บเป็น object key เสมอ (presigned URL หมดอายุ) และรวม files[] ของ seedance2 ด้วย
      referenceImages: this.generateHelperService.collectReferenceKeys(body),
      resolution: body.resolution,
      ratio: body.ratio,
      generateConfig: this.generateHelperService.buildGenerateConfig({
        ratio: body.ratio,
        width: body.width,
        height: body.height,
        prompt: body.prompt,
        duration: +body.duration,
        modelName: body.model,
        imageCount: 0,
        resolution: body.resolution,
        draft: body.draft,
        generateAudio: body.generateAudio,
        watermark: body.watermark,
      }),
    };
  }

  protected buildLogData(
    taskId: string,
    body: RequestVideoGenerateDto,
    user: any,
    creditResult: CreditQuotaResult,
  ): object {
    return {
      taskId,
      projectId: body.projectId,
      userId: user.userId,
      prompt: body.prompt,
      typeGenerate: 'video',
      status: 'pending',
      tokenUsed: creditResult.onhandToken,
      usedCredit: creditResult.incrementCredit,
      usedImage: 1,
      ImageUsed: 1,
      generateAudio: body.generateAudio,
      // เก็บเป็น object key เสมอ (presigned URL หมดอายุ) และรวม files[] ของ seedance2 ด้วย
      referenceImages: this.generateHelperService.collectReferenceKeys(body),
      resolution: body.resolution,
      ratio: body.ratio,
      generateConfig: this.generateHelperService.buildGenerateConfig({
        ratio: body.ratio,
        width: body.width,
        height: body.height,
        prompt: body.prompt,
        duration: +body.duration,
        modelName: body.model,
        imageCount: 0,
        resolution: body.resolution,
        draft: body.draft,
        generateAudio: body.generateAudio,
        watermark: body.watermark,
        files: body.files,
      }),
    };
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
      videoTaskId: null,
    };
  }

  protected async buildReturnResponse(
    taskId: string,
    body: RequestVideoGenerateDto,
    user: any,
    _apiRes: any,
    creditResult: CreditQuotaResult,
  ): Promise<object> {
    return {
      taskId,
      projectId: body.projectId,
      userId: user.userId,
      prompt: body.prompt,
      typeGenerate: 'video',
      genneratedStatus: 'QUEUED',
      createdAt: new Date().toISOString(),
      status: false,
      videoTaskId: null,
      message: 'Video generation queued',
      usedCredit: creditResult.incrementCredit,
      generateConfig: {
        ratio: body.ratio,
        width: body.width,
        height: body.height,
        content: body.prompt,
        duration: body.duration.toString(),
        modelName: body.model,
        imageCount: 0,
        resolution: body.resolution,
        draft: body.draft,
        generateAudio: body.generateAudio,
        watermark: body.watermark,
        files: body.files,
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
  async createVideoGenerationTask(
    body: RequestVideoGenerateDto,
    clientId: string,
  ) {
    return this.createGenerationTask(body, clientId);
  }
}
