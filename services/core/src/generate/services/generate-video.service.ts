import {
  GalleryRepository,
  LogRepository,
  MasterdataModelTypeRepository,
  QUEUE_NAME_VDO,
  RequestVideoGenerateDto,
  ByteplusePayloadVideo,
  TosService,
  MasterModelTypeDto,
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
export class GenerateVideoService extends BaseGenerateService {
  constructor(
    generateHelperService: GenerateHelperService,
    galleryRepo: GalleryRepository,
    logrepo: LogRepository,
    modeltypeRepo: MasterdataModelTypeRepository,
    @InjectRedis() redis: Redis,
    @InjectQueue(QUEUE_NAME_VDO) private readonly videoQueue: Queue,
    private readonly tosService: TosService,
  ) {
    super(generateHelperService, galleryRepo, logrepo, modeltypeRepo, redis);
  }

  protected get modelType(): string {
    return 'video';
  }
  protected get queue(): Queue {
    return this.videoQueue;
  }
  protected getCreditCacheKeyPrefix(): string {
    return 'video_used';
  }

  protected calculateCreditToken(body: RequestVideoGenerateDto): number {
    return (body.width * body.height * body.duration * 24) / 1024;
  }

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

  protected extractExternalTaskId(apiRes: any): string | null {
    return apiRes?.data?.id ?? null;
  }

  protected async buildPayload(
    body: RequestVideoGenerateDto,
    modelDetail: any,
  ): Promise<{ basePayload: any; axiosConfig: AxiosRequestConfig }> {
    const axiosConfig: AxiosRequestConfig = {
      headers: {
        'Content-Type': modelDetail.sendConfig.configType,
        Authorization: `${modelDetail.sendConfig.authorization}`,
      },
      httpsAgent: this.agent,
    };

    const builder = this.payloadBuilders[modelDetail.sendConfig.type];
    console.log(1);
    const basePayload = await builder(body, modelDetail);
    console.log('Built payload for video generation:', basePayload);
    console.log(2);

    return { basePayload, axiosConfig };
  }

  protected buildQueueJobData(
    taskId: string,
    clientId: string,
    body: any,
    userId: string,
    apiRes: any,
    modelDetail: MasterModelTypeDto,
  ): object {
    return {
      taskId,
      clientId,
      body: { ...body },
      userId,
      videoTaskId: apiRes.data.id,
      statusBaseUrl: modelDetail?.taskPollApi ?? null,
      authorization: modelDetail?.sendConfig?.authorization ?? null,
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
      referenceImages:
        body.image.length > 0 ? body.image.filter((item) => item !== null) : [],
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
      videoTaskId: apiRes.data.id,
    };
  }

  protected async buildReturnResponse(
    taskId: string,
    body: RequestVideoGenerateDto,
    user: any,
    apiRes: any,
    creditResult: CreditQuotaResult,
  ): Promise<object> {
    return {
      taskId,
      projectId: body.projectId,
      userId: user.userId,
      prompt: body.prompt,
      typeGenerate: 'video',
      genneratedStatus: 'PENDING',
      createdAt: new Date().toISOString(),
      status: false,
      videoTaskId: apiRes.data.id,
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
  async createVideoGenerationTask(
    body: RequestVideoGenerateDto,
    clientId: string,
  ) {
    return this.createGenerationTask(body, clientId);
  }

  // แยก builder แต่ละ model เป็น private method
  private readonly payloadBuilders: Record<
    string,
    (body: RequestVideoGenerateDto, modelDetail: any) => any
  > = {
    seedance1: this.buildSeedance1Payload.bind(this),
    seedance2: this.buildSeedance2Payload.bind(this),
  };

  private async buildSeedance1Payload(
    body: RequestVideoGenerateDto,
    modelDetail: any,
  ) {
    return {
      model: body.model,
      content: [
        { type: 'text', text: body.prompt },

        ...(body.image[0]
          ? [
              {
                type: 'image_url',
                image_url: {
                  url: await this.tosService.getPreSignedUrl(
                    tosConfigs().tosBucket,
                    body.image[0],
                  ),
                },
                role: 'first_frame',
              },
            ]
          : []),
        ...(body.image[1]
          ? [
              {
                type: 'image_url',
                image_url: {
                  url: await this.tosService.getPreSignedUrl(
                    tosConfigs().tosBucket,
                    body.image[1],
                  ),
                },
                role: 'last_frame',
              },
            ]
          : []),
      ],
      draft: body.draft,
      generate_audio: body.generateAudio,
      ratio: body.ratio,
      duration: body.duration,
      watermark: body.watermark,
      resolution: body.resolution,
    };
  }

  private async buildSeedance2Payload(
    body: RequestVideoGenerateDto,
    modelDetail: any,
  ) {
    const filesUrl = await Promise.all(
      body.files.map(async (file) => {
        if (file.type === 'image') {
          return {
            type: 'image_url',
            image_url: {
              url: await this.tosService.getPreSignedUrl(
                tosConfigs().tosBucket,
                file.url,
              ),
            },
            role: 'reference_image',
          };
        } else if (file.type === 'video') {
          return {
            type: 'video_url',
            video_url: {
              url: await this.tosService.getPreSignedUrl(
                tosConfigs().tosBucket,
                file.url,
              ),
            },
            role: 'reference_video',
          };
        } else {
          return {
            type: 'audio_url',
            audio_url: {
              url: await this.tosService.getPreSignedUrl(
                tosConfigs().tosBucket,
                file.url,
              ),
            },
            role: 'reference_audio',
          };
        }
      }),
    );
    return {
      model: body.model,
      content: [
        { type: 'text', text: body.prompt },
        ...filesUrl,
        ...(body.image[0]
          ? [
              {
                type: 'image_url',
                image_url: {
                  url: await this.tosService.getPreSignedUrl(
                    tosConfigs().tosBucket,
                    body.image[0],
                  ),
                },
                role: 'first_frame',
              },
            ]
          : []),
        ...(body.image[1]
          ? [
              {
                type: 'image_url',
                image_url: {
                  url: await this.tosService.getPreSignedUrl(
                    tosConfigs().tosBucket,
                    body.image[1],
                  ),
                },
                role: 'last_frame',
              },
            ]
          : []),
      ],
      draft: body.draft,
      generate_audio: body.generateAudio,
      ratio: body.ratio,
      duration: body.duration,
      watermark: body.watermark,
      resolution: body.resolution,
    };
  }
}
