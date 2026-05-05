import {
  GalleryRepository,
  LogRepository,
  MasterdataModelTypeRepository,
  QUEUE_NAME_OMNIHUMEN,
  RequestVideoGenerateDto,
  ByteplusePayloadOmnihumen,
  TosService,
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
export class GenerateOmnihumanService {
  private readonly agent = new https.Agent({ rejectUnauthorized: false });

  constructor(
    private readonly galleryRepo: GalleryRepository,
    private readonly logrepo: LogRepository,
    private readonly modeltypeRepo: MasterdataModelTypeRepository,
    private readonly generateHelperService: GenerateHelperService,
    @InjectRedis() private readonly redis: Redis,
    @InjectQueue(QUEUE_NAME_OMNIHUMEN) private omnihumenQueue: Queue,
    private readonly tosService: TosService,
  ) {}

  async createOmnihumenGenerationTask(body: any, clientId: string) {
    let taskId = body.taskId;
    const redisOmnihumenCacheKey = `${body.organizationId}/${body.projectId}/credit_used_${body.userId}`;

    try {
      const { user, projectMember } = await this.generateHelperService.validateUserAndProject(
        body.userId,
        body.projectId,
      );

      if (!projectMember) {
        return { status: 400, data: 'Team member not found' };
      }

      if (user) {
        await this.generateHelperService.logAudit(user.userId, 'CREATE', body, taskId);
      }

      const modelDetail = await this.modeltypeRepo.findOne({
        where: { modelType: body.model, type: 'omnihumen' },
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
      } = await this.checkCreditOmnihumenQuota(
        user.userId,
        body,
        projectMember,
        redisOmnihumenCacheKey,
        modelDetail,
      );

      if (isQuotaExceeded) {
        return {
          status: 400,
          data: `Token used ${usedCredit} exceed max token ${limitAllowance}`,
        };
      }

      const resolution = body.resolution
        ? parseInt(body.resolution.replace('p', ''))
        : 720;
      const { basePayload, axiosConfig } =
        await this.prepareGenerationPayloadOmnihumen(
          {
            req_key: modelDetail.modelType,
            image_url: body.image[0],
            audio_url: body.image[1],
            output_resolution: resolution,
            prompt: body.prompt,
            seed: body.seed,
            pe_fast_mode: body.fastMode,
          },
          modelDetail.sendConfig,
          body.organizationId,
        );
      console.log('basePayload', basePayload);

      const res = await this.executeGenerationRequestOmnihumen(
        modelDetail.sendApi,
        basePayload,
        axiosConfig,
      );

      taskId = res.data.data.task_id;
      console.log('Response from external API:', res);
      console.log('taskId---:', taskId);

      await this.galleryRepo.create({
        data: {
          taskId,
          projectId: body.projectId,
          userId: user.userId,
          prompt: body.prompt,
          imageUrl: '',
          typeGenerate: 'omnihumen',
          genneratedStatus: 'PENDING',
          status: false,
          usedCredit: incrementCredit,
          usedImage: 1,
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
        },
      });
      const log = await this.logrepo.create({
        data: {
          taskId,
          projectId: body.projectId,
          userId: user.userId,
          prompt: body.prompt || '',
          typeGenerate: 'omnihumen',
          status: 'pending',
          tokenUsed: onhandToken,
          usedCredit: incrementCredit,
          usedImage: 1,
          ImageUsed: 1,
          generateAudio: body.generateAudio,
          referenceImages:
            body.image.length > 0
              ? body.image.filter((item: any) => item !== null)
              : [],
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
        redisOmnihumenCacheKey,
        usedCredit.toString(),
        'EX',
        24 * 60 * 60,
      );
      
      const job = await this.omnihumenQueue.add(
        QUEUE_NAME_OMNIHUMEN,
        {
          taskId,
          clientId,
          body: { ...body },
          userId: user.userId,
          omnihumenTaskId: taskId,
          reqKey: modelDetail.modelType,
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
          type: 'omnihumen',
          omnihumenTaskId: taskId,
          createdAt: new Date().toISOString(),
        }),
        'EX',
        24 * 60 * 60,
      );

      console.log(`✅ Omnihumen Task created: ${taskId}, Job ID: ${job.id}`);

      return {
        status: 200,
        data: {
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
      console.error('Error creating omnihumen generation task:', error);
      this.generateHelperService.handleGenerationError(error, body.userId);
      throw error;
    }
  }

  private async checkCreditOmnihumenQuota(
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

    const onhandCredit = await this.generateHelperService.getUsedCredit(0, body, model);
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

  private async prepareGenerationPayloadOmnihumen(
    body: ByteplusePayloadOmnihumen,
    configApi: any,
    organizationId: string,
  ) {
    const accessKey =
      process.env.BYTEPLUS_ACCESS_KEY ||
      'AKAPYzE5OGNhNmRkZDVlNDllYzlhM2MwNTU3MTE0YWM4ZGM';
    const secretKey =
      process.env.BYTEPLUS_SECRET_KEY ||
      'T1RnM09HSTJNVFEwWmpBek5EY3lNMkZqWmpabE5tWm1aR0ZrT0dabU9UVQ==';

    const queryParams = { Action: 'CVSubmitTask', Version: '2024-06-06' };

    const basePayload = {
      ...body,
      req_key: 'realman_avatar_picture_omni15_cv',
      image_url: await this.tosService.getPreSignedUrl(
        tosConfigs().tosBucket,
        body.image_url,
      ),
      audio_url: await this.tosService.getPreSignedUrl(
        tosConfigs().tosBucket,
        body.audio_url,
      ),
    } as ByteplusePayloadOmnihumen;

    const headers = this.generateHelperService.signBytePlusRequest(
      'POST',
      '/',
      queryParams,
      basePayload,
      accessKey,
      secretKey,
    );

    const axiosConfig: AxiosRequestConfig = {
      headers: headers,
      params: queryParams,
      httpsAgent: this.agent,
    };

    return { basePayload, axiosConfig };
  }

  private async executeGenerationRequestOmnihumen(
    url: string,
    payload: any,
    config: AxiosRequestConfig,
  ) {
    return await axios.post(url, payload, config);
  }
}
