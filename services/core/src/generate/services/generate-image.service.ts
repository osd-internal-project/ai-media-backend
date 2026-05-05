import {
  AuditLogRepository,
  ErrorLogRepository,
  GalleryRepository,
  LogRepository,
  MasterDataConfigApiRepository,
  MasterdataModelTypeRepository,
  ProjectMemberRepository,
  QUEUE_NAME_IMAGE,
  UsersRepository,
  ByteplusePayloadImage,
  RequestImageGenerateDto,
  RequestVideoGenerateDto,
  QUEUE_NAME_VDO,
  ByteplusePayloadVideo,
  TosService,
  QUEUE_NAME_OMNIHUMEN,
  ByteplusePayloadOmnihumen,
  ByteplusePayloadDreamactor,
  QUEUE_NAME_DREAMACTOR,
  CreditBalanceRepository,
  ProjectRepository,
  MasterModelTypeDto,
} from '@ai-media/share';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import axios, { AxiosRequestConfig } from 'axios';
import { Queue } from 'bullmq';
import * as https from 'https';
import Redis from 'ioredis';
import { tosConfigs } from 'src/configs';
import { GenerateHelperService } from './generate-helper.service';

@Injectable()
export class GenerateImageService {
  private readonly agent = new https.Agent({ rejectUnauthorized: false });

  constructor(
    private readonly projectRepo: ProjectRepository,
    private readonly projectMemberRepo: ProjectMemberRepository,
    private readonly userRepo: UsersRepository,
    private readonly errorLogRepo: ErrorLogRepository,
    private readonly auditLogRepo: AuditLogRepository,
    private readonly logrepo: LogRepository,
    private readonly galleryRepo: GalleryRepository,
    private readonly modeltypeRepo: MasterdataModelTypeRepository,
    private readonly creditBalanceRepo: CreditBalanceRepository,
    private readonly generateHelperService: GenerateHelperService,

    @InjectRedis() private readonly redis: Redis,
    @InjectQueue(QUEUE_NAME_IMAGE) private imageQueue: Queue,
    private readonly tosService: TosService,
  ) {}

  /**
   * สร้าง Generation Task และส่งเข้า Queue
   */
  async createImageGenerationTask(
    body: RequestImageGenerateDto,
    clientId: string,
  ) {
    const taskId = body.taskId;
    let holdCreditCount = 0;
    // const redisImageCacheKey = `${body.organizationId}/${body.projectId}/image_used_${body.userId}`;
    const redisImageCacheKey = `${body.organizationId}/${body.projectId}/credit_used_${body.userId}`;

    try {
      // 1. Validate User & Project
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
      // 2. Get Config & Model

      const modelDetail = await this.modeltypeRepo.findOne({
        where: { modelType: body.model, type: 'image' },
      });

      if (!modelDetail) {
        return { status: 400, data: 'Model not found' };
      }
      // const getConfigApi = await this.masterdataconfigapiRepo.findOne({
      //   where: { id: 1 },
      // });
      // 3. Check Quota
      const { isQuotaExceeded, currentCreditUsed, onholdCredits } =
        await this.checkCreditImageQuota(
          user.userId,
          body,
          projectMember,
          redisImageCacheKey,
          modelDetail,
        );
      if (isQuotaExceeded) {
        return { status: 400, data: 'Image limit exceeded' };
      }
      // 3.1 Check Hold
      holdCreditCount = onholdCredits;

      let imageUrls: string[] = [];
      if (body.image && body.image.length > 0) {
        imageUrls = await Promise.all(
          body.image.map((img) =>
            this.tosService.getPreSignedUrl(tosConfigs().tosBucket, img),
          ),
        );
      }

      let prompt = body.prompt;
      if (body.maxImages && body.maxImages > 1) {
        prompt = `create ${body.maxImages} images ` + prompt;
      }
      // 4. Prepare Payload
      const { basePayload, axiosConfig } =
        await this.prepareGenerationPayloadImage(
          { ...body, prompt },
          modelDetail.sendConfig,
          user.userId,
          taskId,
        );

      // 5. Call External API
      const res = await this.executeGenerationRequest(
        modelDetail.sendApi,
        basePayload,
        axiosConfig,
      );
      // 6. อัพเดท cache
      await this.redis.set(
        redisImageCacheKey,
        currentCreditUsed.toString(),
        'EX',
        24 * 60 * 60,
      );

      // 7. สร้าง Job ใน Queue
      const job = await this.imageQueue.add(
        QUEUE_NAME_IMAGE,
        {
          taskId,
          clientId,
          body: { ...body },
          userId: user.userId,
          dataImage: res.data.data,
          usage: res.data.usage,
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

      // 8. บันทึก task metadata ใน Redis
      await this.redis.set(
        `task:${taskId}`,
        JSON.stringify({
          taskId,
          jobId: job.id,
          clientId,
          userId: user.userId,
          projectId: body.projectId,
          status: 'queued',
          totalImages: res.data.data.length,
          createdAt: new Date().toISOString(),
        }),
        'EX',
        24 * 60 * 60,
      );

      console.log(`✅ Task created: ${taskId}, Job ID: ${job.id}`);
      return {
        status: 200,
        // data: {
        //     taskId: taskId.toString(),
        //     jobId: job.id,
        //     message: 'Image generation queued',
        //     estimatedImages: res.data.data.length,
        // },
        data: {
          taskId,
          projectId: body.projectId,
          userId: user.userId,
          prompt: body.prompt,
          imageUrl: res.data.data,
          typeGenerate: 'image',
          genneratedStatus: 'SUCCESS',
          status: true,
          generateConfig: this.generateHelperService.buildGenerateConfig({
            ratio: body.ratio,
            width: body.width,
            height: body.height,
            prompt: body.prompt,
            duration: 0,
            modelName: body.model,
            imageCount: body.maxImages,
            resolution: body.size,
            generateAudio: false,
          }),
          users: {
            fullname: user.fullname,
            userId: user.userId,
            username: user.username,
          },
          referenceImages: imageUrls,
          resolution: body.size,
          ratio: body.ratio,
          imageUrls: [],
        },
      };
    } catch (error) {
      console.error('Error creating generation task:', error);
      this.generateHelperService.cancelHoldAmount(
        holdCreditCount,
        body.userId,
        body.projectId,
      );
      this.generateHelperService.handleGenerationError(error, body.userId);
      throw error;
    }
  }

  private async checkCreditImageQuota(
    userId: string,
    body: RequestImageGenerateDto,
    projectMember: any,
    cacheKey: string,
    model: MasterModelTypeDto,
  ): Promise<{
    isQuotaExceeded: boolean;
    currentCreditUsed: number;
    maxCreditInPlan: number;
    onholdCredits: number;
  }> {
    try {
      let currentCreditUsed = 0;

      let cachedCreditUsed: string | null = null;
      if (cacheKey) {
        cachedCreditUsed = await this.redis.get(cacheKey);
      }

      if (cachedCreditUsed) {
        currentCreditUsed = parseInt(cachedCreditUsed);
      } else {
        // Fallback to DB calculation
        // const aggregateResult = await this.logrepo.aggregate({
        //   where: {
        //     userId: userId,
        //     typeGenerate: body.type,
        //     projectId: body.projectId,
        //     status: 'success',
        //     createdAt: {
        //       gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        //       lt: new Date(
        //         new Date().getFullYear(),
        //         new Date().getMonth() + 1,
        //         1,
        //       ),
        //     },
        //   },
        //   _sum: {
        //     ImageUsed: true,
        //   },
        // });
        // currentImageUsed = aggregateResult._sum.ImageUsed || 0;
        currentCreditUsed =
          // projectMember.holdImageAllowance + projectMember.usedImageAllowance;
          projectMember.holdCreditAllowance + projectMember.usedCreditAllowance;
      }

      const credit = await this.generateHelperService.getUsedCredit(0, body, model);
      if (!credit) {
        return {
          isQuotaExceeded: true,
          currentCreditUsed: 0,
          maxCreditInPlan: 0,
          onholdCredits: 0,
        };
      }
      const maxCreditInPlan = projectMember?.limitCreditAllowance || 0;
      currentCreditUsed = currentCreditUsed + credit.credit;
      //Check Allowence :Member > Team >Organization
      if (currentCreditUsed > maxCreditInPlan) {
        Logger.error(
          `Credit used ${
            currentCreditUsed + credit.credit
          } exceed max credit ${maxCreditInPlan}`,
        );
        return {
          isQuotaExceeded: true,
          currentCreditUsed: currentCreditUsed,
          maxCreditInPlan: maxCreditInPlan,
          onholdCredits: credit.credit,
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
          currentCreditUsed: currentCreditUsed,
          maxCreditInPlan: maxCreditInPlan,
          onholdCredits: credit.credit,
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
          `Credit Balance used ${
            creditBalance.currentCycleBalance + creditBalance.onTopBalance
          } exceed max organize credit ${credit.credit}`,
        );

        return {
          isQuotaExceeded: true,
          currentCreditUsed: currentCreditUsed,
          maxCreditInPlan: maxCreditInPlan,
          onholdCredits: credit.credit,
        };
      }
      await this.generateHelperService.updateHoldCreditBalance(
        userId,
        body.organizationId,
        body.projectId,
        'credit',
        credit.credit,
      );
      return {
        isQuotaExceeded: false,
        currentCreditUsed: currentCreditUsed,
        maxCreditInPlan: maxCreditInPlan,
        onholdCredits: credit.credit,
      };
    } catch (e) {
      Logger.error(e);
      return {
        isQuotaExceeded: true,
        currentCreditUsed: 0,
        maxCreditInPlan: 0,
        onholdCredits: 0,
      };
    }
  }
  private async prepareGenerationPayloadImage(
    body: RequestImageGenerateDto,
    configApi: any,
    userId: string,
    taskId: string,
    imageUrls?: string[],
  ) {
    const axiosConfig: AxiosRequestConfig = {
      headers: {
        'Content-Type': configApi.configType,
        Authorization: `${configApi.authorization}`,
      },
      httpsAgent: this.agent,
    };

    // let imageUrls: string[] = [];
    // if (body.image && body.image.length > 0) {
    //     imageUrls = await Promise.all(
    //         body.image.map((img) =>
    //             this.minioClientSerives.getPresignedUrl(
    //                 this.minioconfig.minioBucketUpload,
    //                 img,
    //             ),
    //         ),
    //     );
    // }
    // prompt: `create ${body.images || 1} images ${body.text}`,
    const basePayload = {
      model: body.model,
      prompt: body.prompt,
      response_format: 'url',
      ...(body.image.length > 0 && { image: imageUrls }),
      stream: configApi.stream ?? false,
      watermark: configApi.watermark ?? false,
      ratio: body.ratio,
      size: `${body.width}x${body.height}`,
      sequential_image_generation: body.sequentialImageGeneration,
      ...(body.maxImages && {
        sequential_image_generation_options: { max_images: body.maxImages },
      }),
    } as ByteplusePayloadImage;
    // Logger.log(basePayload, 'basePayload');
    return { basePayload, axiosConfig };
  }

  private async executeGenerationRequest(
    url: string,
    payload: any,
    config: AxiosRequestConfig,
  ) {
    return await axios.post(url, payload, config);
  }

  /**
   * ดึงสถานะของ Task
   */
  async getTaskStatus(taskId: string) {
    const taskData = await this.redis.get(`task:${taskId}`);
    if (!taskData) {
      return { status: 'not_found' };
    }

    const task = JSON.parse(taskData);

    // ดึงสถานะจาก BullMQ
    const job = await this.imageQueue.getJob(task.jobId);
    if (!job) {
      return { status: 'not_found' };
    }

    const state = await job.getState();
    const progress = job.progress || {};

    return {
      taskId,
      jobId: task.jobId,
      status: state,
      progress,
      createdAt: task.createdAt,
      totalImages: task.totalImages,
      ...(state === 'completed' && {
        result: job.returnvalue,
      }),
      ...(state === 'failed' && {
        error: job.failedReason,
        attempts: job.attemptsMade,
      }),
    };
  }

  /**
   * ยกเลิก Task
   */
  async cancelTask(taskId: string) {
    try {
      const taskData = await this.redis.get(`task:${taskId}`);
      if (!taskData) {
        return { success: false, message: 'Task not found' };
      }

      const task = JSON.parse(taskData);
      const job = await this.imageQueue.getJob(task.jobId);

      if (!job) {
        return { success: false, message: 'Job not found' };
      }

      const state = await job.getState();

      if (state === 'completed' || state === 'failed') {
        return { success: false, message: `Job already ${state}` };
      }

      // Remove job from queue
      await job.remove();

      // อัพเดทสถานะใน Redis
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
    } catch (error) {
      console.error('Error cancelling task:', error);
      return { success: false, message: error.message };
    }
  }
}
