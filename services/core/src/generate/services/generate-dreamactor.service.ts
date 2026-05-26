import {
  GalleryRepository,
  LogRepository,
  MasterdataModelTypeRepository,
  QUEUE_NAME_DREAMACTOR,
  ByteplusePayloadDreamactor,
  TosService,
  MasterModelTypeDto,
  RequestDreamactorGenerateDto,
} from '@ai-media/share';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { AxiosRequestConfig } from 'axios';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { tosConfigs } from 'src/configs';
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
    modeltypeRepo: MasterdataModelTypeRepository,
    @InjectRedis() redis: Redis,
    @InjectQueue(QUEUE_NAME_DREAMACTOR) private readonly dreamactorQueue: Queue,
    private readonly tosService: TosService,
  ) {
    super(generateHelperService, galleryRepo, logrepo, modeltypeRepo, redis);
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

  protected async buildPayload(
    body: any,
    modelDetail: MasterModelTypeDto,
  ): Promise<{ basePayload: any; axiosConfig: AxiosRequestConfig }> {
    const accessKey =
      process.env.BYTEPLUS_ACCESS_KEY ||
      'AKAPYzE5OGNhNmRkZDVlNDllYzlhM2MwNTU3MTE0YWM4ZGM';
    const secretKey =
      process.env.BYTEPLUS_SECRET_KEY ||
      'T1RnM09HSTJNVFEwWmpBek5EY3lNMkZqWmpabE5tWm1aR0ZrT0dabU9UVQ==';

    const queryParams = {
      Action: 'CVSync2AsyncSubmitTask',
      Version: '2024-06-06',
    };
    const matchedKey = modelDetail.sendConfig.type;
    const builder = this.payloadBuilders[matchedKey];
    const basePayload = await builder(body, modelDetail);
    const headers = this.generateHelperService.signBytePlusRequest(
      'POST',
      '/',
      queryParams,
      basePayload,
      accessKey,
      secretKey,
    );

    const axiosConfig: AxiosRequestConfig = {
      headers,
      params: queryParams,
      httpsAgent: this.agent,
    };

    return { basePayload, axiosConfig };
  }

  protected buildQueueJobData(
    taskId: string,
    clientId: string,
    body: any,
    userId: string,
    _apiRes: any,
    modelDetail: MasterModelTypeDto,
  ): object {
    return {
      taskId,
      clientId,
      body: { ...body },
      userId,
      dreamactorTaskId: taskId,
      reqKey: modelDetail.modelType,
      statusBaseUrl: modelDetail?.taskPollApi ?? 'https://cv.byteplusapi.com/',
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
      ...super.buildRedisTaskMetadata(
        taskId,
        jobId,
        clientId,
        userId,
        body,
        apiRes,
      ),
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

  // แยก builder แต่ละ model เป็น private method
  private readonly payloadBuilders: Record<
    string,
    (body: RequestDreamactorGenerateDto, modelDetail: any) => any
  > = {
    dreamactor: this.buildDreamacterPayload.bind(this),
  };
  private async buildDreamacterPayload(
    body: RequestDreamactorGenerateDto,
    modelDetail: any,
  ) {
    return {
      req_key: modelDetail.modelType || 'dreamactor_m20_gen_video_cvtob',
      image_urls: await Promise.all(
        [body.image[0]].map((url) =>
          this.tosService.getPreSignedUrl(tosConfigs().tosBucket, url),
        ),
      ),
      video_url: await this.tosService.getPreSignedUrl(
        tosConfigs().tosBucket,
        body.image[1],
      ),
    };
  }
}
