import {
  AuditLogRepository,
  ErrorLogRepository,
  GalleryRepository,
  LogRepository,
  MasterDataConfigApiRepository,
  MasterdataModelTypeRepository,
  ProjectMemberRepository,
  QUEUE_NAME_VDO,
  UsersRepository,
  RequestVideoGenerateDto,
  ByteplusePayloadVideo,
  TosService,
  CreditBalanceRepository,
  ProjectRepository,
  MasterModelTypeDto,
} from '@ai-media/share';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosRequestConfig } from 'axios';
import { Queue } from 'bullmq';
import * as https from 'https';
import Redis from 'ioredis';
import { tosConfigs } from 'src/configs';
import { GenerateHelperService } from './generate-helper.service';

@Injectable()
export class GenerateVideoService {
  private readonly agent = new https.Agent({ rejectUnauthorized: false });

  constructor(
    private readonly generateHelperService: GenerateHelperService,
    private readonly galleryRepo: GalleryRepository,
    private readonly logrepo: LogRepository,
    private readonly modeltypeRepo: MasterdataModelTypeRepository,
    @InjectRedis() private readonly redis: Redis,
    @InjectQueue(QUEUE_NAME_VDO) private videoQueue: Queue,
    private readonly tosService: TosService,
  ) {}

  async createVideoGenerationTask(
    body: RequestVideoGenerateDto,
    clientId: string,
  ) {
    let taskId = body.taskId;
    const redisVideoCacheKey = `${body.organizationId}/${body.projectId}/video_used_${body.userId}`;

    try {
      const { user, projectMember } =
        await this.generateHelperService.validateUserAndProject(
          body.userId,
          body.projectId,
        );

      if (!projectMember) {
        return { status: 400, data: 'Team member not found' };
      }

      if (user) {
        await this.generateHelperService.logAudit(
          user.userId,
          'CREATE',
          body,
          taskId,
        );
      }

      const modelDetail = await this.modeltypeRepo.findOne({
        where: { modelType: body.model, type: 'video' },
      });

      if (!modelDetail) {
        return { status: 400, data: 'Model not found' };
      }

      const {
        isQuotaExceeded,
        incrementCredit,
        limitAllowance,
        usedCredit,
        onhandToken,
      } = await this.checkCreditVideoQuota(
        user.userId,
        body,
        projectMember,
        redisVideoCacheKey,
        modelDetail,
      );

      if (isQuotaExceeded) {
        return {
          status: 400,
          data: `Token used ${usedCredit} exceed max credit ${limitAllowance}`,
        };
      }

      const { basePayload, axiosConfig } =
        await this.prepareGenerationPayloadVideo(
          body,
          modelDetail.sendConfig,
          body.organizationId,
        );

      Logger.debug('basePayload', basePayload);

      const res = await this.executeGenerationRequestVideo(
        modelDetail.sendApi,
        basePayload,
        axiosConfig,
      );

      taskId = res.data.id;
      await this.galleryRepo.create({
        data: {
          taskId,
          projectId: body.projectId,
          userId: user.userId,
          prompt: body.prompt,
          imageUrl: '',
          typeGenerate: 'video',
          genneratedStatus: 'PENDING',
          status: false,
          usedCredit: incrementCredit,
          generateConfig: this.generateHelperService.buildGenerateConfig({
            ratio: body.ratio,
            width: body.width,
            height: body.height,
            prompt: body.prompt,
            duration: +body.duration,
            modelName: body.model,
            imageCount: 0,
            resolution: body.size,
            draft: body.draft,
            generateAudio: body.generateAudio,
            watermark: body.watermark,
          }),
        },
      });
      const log = await this.logrepo.create({
        data: {
          taskId,
          projectId: body.projectId,
          userId: user.userId,
          prompt: body.prompt,
          typeGenerate: 'video',
          status: 'pending',
          tokenUsed: onhandToken,
          usedCredit: incrementCredit,
          usedImage: 1,
          ImageUsed: 1,
          generateAudio: body.generateAudio,
          referenceImages:
            body.image.length > 0
              ? body.image.filter((item) => item !== null)
              : [],
          resolution: body.size,
          ratio: body.ratio,
          generateConfig: this.generateHelperService.buildGenerateConfig({
            ratio: body.ratio,
            width: body.width,
            height: body.height,
            prompt: body.prompt,
            duration: +body.duration,
            modelName: body.model,
            imageCount: 0,
            resolution: body.size,
            draft: body.draft,
            generateAudio: body.generateAudio,
            watermark: body.watermark,
            files: body.files,
          }),
        },
      });
      if (log) {
        await this.generateHelperService.updateHoldCreditBalance(
          user.userId,
          body.organizationId,
          body.projectId,
          'credit',
          incrementCredit,
        );
      }

      await this.redis.set(
        redisVideoCacheKey,
        usedCredit.toString(),
        'EX',
        24 * 60 * 60,
      );

      const job = await this.videoQueue.add(
        QUEUE_NAME_VDO,
        {
          taskId,
          clientId,
          body: { ...body },
          userId: user.userId,
          videoTaskId: res.data.id,
        },
        {
          jobId: taskId,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
      );

      await this.redis.set(
        `task:${taskId}`,
        JSON.stringify({
          taskId,
          jobId: job.id,
          clientId,
          userId: user.userId,
          projectId: body.projectId,
          status: 'queued',
          type: 'video',
          videoTaskId: res.data.id,
          createdAt: new Date().toISOString(),
        }),
        'EX',
        24 * 60 * 60,
      );

      console.log(`✅ Video Task created: ${taskId}, Job ID: ${job.id}`);

      return {
        status: 200,
        data: {
          taskId,
          projectId: body.projectId,
          userId: user.userId,
          prompt: body.prompt,
          typeGenerate: 'video',
          genneratedStatus: 'PENDING',
          createdAt: new Date().toISOString(),
          status: false,
          videoTaskId: res.data.id,
          message: 'Video generation queued',
          usedCredit: incrementCredit,
          generateConfig: {
            ratio: body.ratio,
            width: body.width,
            height: body.height,
            content: body.prompt,
            duration: body.duration.toString(),
            modelName: body.model,
            imageCount: 0,
            resolution: body.size,
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
          resolution: body.size,
          ratio: body.ratio,
          imageUrls: [],
        },
      };
    } catch (error) {
      console.error('Error creating video generation task:', error);
      this.generateHelperService.handleGenerationError(error, body.userId);
      throw error;
    }
  }

  private async checkCreditVideoQuota(
    userId: string,
    body: RequestVideoGenerateDto,
    projectMember: any,
    cacheKey: string,
    model: MasterModelTypeDto,
  ): Promise<{
    isQuotaExceeded: boolean;
    incrementCredit: number;
    limitAllowance: number;
    usedCredit: number;
    onhandToken: number;
  }> {
    const frameRate = 24;
    let currentCreditUsed = 0;

    let cachedCreditUsed: string | null = null;
    if (cacheKey) {
      cachedCreditUsed = await this.redis.get(cacheKey);
    }

    if (cachedCreditUsed) {
      currentCreditUsed = parseInt(cachedCreditUsed);
    } else {
      currentCreditUsed =
        projectMember.holdCreditAllowance + projectMember.usedCreditAllowance;
    }
    const onhandToken =
      (body.width * body.height * body.duration * frameRate) / 1024;
    const onhandCredit = await this.generateHelperService.getUsedCredit(
      onhandToken,
      body,
      model,
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
        `Token used ${usedCredit} exceed max token ${limitAllowance}`,
      );
      return {
        isQuotaExceeded: true,
        incrementCredit: onhandCredit.credit,
        limitAllowance: limitAllowance,
        usedCredit: usedCredit,
        onhandToken: onhandCredit.token,
      };
    }

    return {
      isQuotaExceeded: false,
      incrementCredit: onhandCredit.credit,
      limitAllowance: limitAllowance,
      usedCredit: usedCredit,
      onhandToken: onhandCredit.token,
    };
  }

  private async prepareGenerationPayloadVideo(
    body: RequestVideoGenerateDto,
    config: any,
    organizationId: string,
  ) {
    const axiosConfig: AxiosRequestConfig = {
      headers: {
        'Content-Type': config.configType,
        Authorization: `${config.authorization}`,
      },
      httpsAgent: this.agent,
    };

    const filesUrl = await Promise.all(
      body.files.map(async (file, index) => {
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
        } else if (file.type === 'audio') {
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
    const basePayload = {
      model: body.model,
      content: [
        {
          type: 'text',
          text: body.prompt,
        },
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
      resolution: body.size,
    } as ByteplusePayloadVideo;
    return { basePayload, axiosConfig };
  }

  private async executeGenerationRequestVideo(
    url: string,
    payload: any,
    config: AxiosRequestConfig,
  ) {
    return await axios.post(url, payload, config);
  }
}
