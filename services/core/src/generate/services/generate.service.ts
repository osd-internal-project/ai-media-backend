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
import e from 'express';
import * as https from 'https';
import Redis from 'ioredis';
import { tosConfigs } from 'src/configs';
import { GenerateDreamactorService } from './generate-dreamactor.service';
import { GenerateImageService } from './generate-image.service';
import { GenerateOmnihumanService } from './generate-omnihuman.service';
import { GenerateVideoService } from './generate-video.service';

@Injectable()
export class GenerateService {
  private readonly agent = new https.Agent({ rejectUnauthorized: false });

  constructor(
    private readonly masterdataconfigapiRepo: MasterDataConfigApiRepository,
    private readonly projectRepo: ProjectRepository,
    private readonly projectMemberRepo: ProjectMemberRepository,
    private readonly userRepo: UsersRepository,
    private readonly errorLogRepo: ErrorLogRepository,
    private readonly auditLogRepo: AuditLogRepository,
    private readonly logrepo: LogRepository,
    private readonly galleryRepo: GalleryRepository,
    private readonly modeltypeRepo: MasterdataModelTypeRepository,
    private readonly creditBalanceRepo: CreditBalanceRepository,
    private readonly generateImageService: GenerateImageService,
    private readonly generateVideoService: GenerateVideoService,
    private readonly generateOmnihumanService: GenerateOmnihumanService,
    private readonly generateDreamactorService: GenerateDreamactorService,

    @InjectRedis() private readonly redis: Redis,
    private readonly tosService: TosService,
  ) {}

  /**
   * สร้าง Generation Task และส่งเข้า Queue
   */

  async createImageGenerationTask(body: any, clientId: string) {
    return await this.generateImageService.createImageGenerationTask(body, clientId);
  }

  async createVideoGenerationTask(body: any, clientId: string) {
    return await this.generateVideoService.createVideoGenerationTask(
      body,
      clientId,
    );
  }

  async createOmnihumenGenerationTask(body: any, clientId: string) {
    return await this.generateOmnihumanService.createOmnihumenGenerationTask(
      body,
      clientId,
    );
  }

  async createDreamactorGenerationTask(body: any, clientId: string) {
    return await this.generateDreamactorService.createDreamactorGenerationTask(
      body,
      clientId,
    );
  }


  async getImageTaskStatus(taskId: string) {
    return await this.generateImageService.getTaskStatus(taskId);
  }

  async cancelImageTask(taskId: string) {
    return await this.generateImageService.cancelTask(taskId);
  }

  /**
   * ดึงรายการ tasks ของ user
   */
  async getUserTasks(userId: string, limit = 20) {
    const keys = await this.redis.keys(`task:*`);
    const tasks = [];

    for (const key of keys.slice(0, limit)) {
      const data = await this.redis.get(key);
      if (data) {
        const task = JSON.parse(data);
        if (task.userId === userId) {
          tasks.push(task);
        }
      }
    }

    return tasks.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  // --- Helper Methods ---

  public async validateUserAndProject(userId: string, projectId: string) {
    const user = await this.userRepo.findOne({
      where: { token: userId },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    const projectMember = await this.projectMemberRepo.findOne({
      where: {
        projectId: projectId,
        userId: user.userId,
      },
    });

    return { user, projectMember };
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

      const credit = await this.getUsedCredit(0, body, model);
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
      await this.updateHoldCreditBalance(
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

  // private async checkTokenVideoQuota(
  //   userId: string,
  //   body: RequestVideoGenerateDto,
  //   projectMember: any,
  //   cacheKey: string,
  // ): Promise<{
  //   isQuotaExceeded: boolean;
  //   currentTokenUsed: number;
  //   maxTokenInPlan: number;
  //   onhandToken: number;
  // }> {
  //   const frameRate = 24;
  //   let currentTokenUsed = 0;
  //   // const maxToken = body.maxImages || 0;

  //   let cachedTokenUsed: string | null = null;
  //   if (cacheKey) {
  //     cachedTokenUsed = await this.redis.get(cacheKey);
  //   }

  //   if (cachedTokenUsed) {
  //     currentTokenUsed = parseInt(cachedTokenUsed);
  //   } else {
  //     // Fallback to DB calculation
  //     // const aggregateResult = await this.logrepo.aggregate({
  //     //   where: {
  //     //     userId: userId,
  //     //     typeGenerate: body.typeGenerate,
  //     //     projectId: body.projectId,
  //     //     status: 'success',
  //     //     createdAt: {
  //     //       gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  //     //       lt: new Date(
  //     //         new Date().getFullYear(),
  //     //         new Date().getMonth() + 1,
  //     //         1,
  //     //       ),
  //     //     },
  //     //   },
  //     //   _sum: {
  //     //     tokenUsed: true,
  //     //   },
  //     // });

  //     // currentTokenUsed = aggregateResult._sum.tokenUsed || 0;
  //     const cachedTokenUsed =
  //       projectMember.holdTokenAllowance + projectMember.usedTokenAllowance;
  //   }
  //   const onhandToken =
  //     (body.width * body.height * body.duration * frameRate) / 1024;
  //   currentTokenUsed = currentTokenUsed + onhandToken || 0;
  //   const maxTokenInPlan = projectMember.maxToken || 0;
  //   // currentTokenUsed = currentTokenUsed ;
  //   if (currentTokenUsed > maxTokenInPlan) {
  //     Logger.error(
  //       `Token used ${currentTokenUsed} exceed max token ${maxTokenInPlan}`,
  //     );
  //     return {
  //       isQuotaExceeded: true,
  //       currentTokenUsed: currentTokenUsed,
  //       maxTokenInPlan: maxTokenInPlan,
  //       onhandToken: onhandToken,
  //     };
  //   }

  //   return {
  //     isQuotaExceeded: false,
  //     currentTokenUsed: currentTokenUsed,
  //     maxTokenInPlan: maxTokenInPlan,
  //     onhandToken: onhandToken,
  //   };
  // }

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
    // const maxToken = body.maxImages || 0;

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
      //     typeGenerate: body.typeGenerate,
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
      //     tokenUsed: true,
      //   },
      // });

      // currentTokenUsed = aggregateResult._sum.tokenUsed || 0;
      currentCreditUsed =
        projectMember.holdCreditAllowance + projectMember.usedCreditAllowance;
    }
    const onhandToken =
      (body.width * body.height * body.duration * frameRate) / 1024;
    const onhandCredit = await this.getUsedCredit(onhandToken, body, model);
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
    // currentTokenUsed = currentTokenUsed ;
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

    const onhandCredit = await this.getUsedCredit(0, body, model);
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
    // currentTokenUsed = currentTokenUsed ;
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
  private async checkCreditDreamactorQuota(
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
    const onhandCredit = await this.getUsedCredit(0, body, model);
    if (!onhandCredit) {
      return {
        isQuotaExceeded: true,
        incrementCredit: 0,
        limitAllowance: 0,
        usedCredit: 0,
        onhandToken: 0,
      };
    }
    console.log('onhandCredit', onhandCredit);
    const usedCredit = currentCreditUsed + onhandCredit.credit || 0;

    const limitAllowance = projectMember.limitCreditAllowance || 0;

    // currentTokenUsed = currentTokenUsed ;
    if (usedCredit > limitAllowance) {
      Logger.error(
        `Credit used ${usedCredit} exceed max credit ${limitAllowance}`,
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

  public handleGenerationError(error: any, userId: string) {
    Logger.error(
      `Error generate image: ${
        error?.response?.data?.error_description || error.message
      }`,
      error?.response?.data ? JSON.stringify(error.response.data) : error.stack,
    );
    if (axios.isAxiosError(error) && error.response) {
      const { status, data } = error.response;
      const message = data?.error?.message || '';

      this.logError(userId, message, error.stack, data);
      throw new ConflictException(message);
    }

    throw new InternalServerErrorException('Failed to generate image');
  }

  public buildGenerateConfig(body: {
    ratio: string;
    width: number;
    height: number;
    prompt: string;
    duration: number;
    modelName: string;
    imageCount: number;
    resolution: string;
    generateAudio: boolean;
    draft?: boolean;
    watermark?: boolean;
    seed?: number;
    fastMode?: boolean;
    files?: { type: string; url: string }[];
  }) {
    return {
      ...(body?.width && { width: body?.width }),
      ...(body?.height && { height: body?.height }),
      ...(body?.ratio && { ratio: body?.ratio }),
      ...(body?.imageCount && { imageCount: body?.imageCount }),
      ...(body?.resolution && { resolution: body?.resolution }),
      ...(body?.modelName && { modelName: body?.modelName }),
      ...(body?.duration && { duration: body?.duration }),
      content: body?.prompt,
      ...(body?.generateAudio && { generateAudio: body?.generateAudio }),
      ...(body?.draft && { draft: body?.draft }),
      ...(body?.watermark && { watermark: body?.watermark }),
    };
  }

  public async logAudit(
    userId: string,
    action: string,
    details: any,
    entityId: string,
  ) {
    try {
      await this.auditLogRepo.create({
        data: {
          userId,
          action: 'CREATE',
          entityName: 'GenerateImage',
          entityId,
          newValues: details,
        } as any,
      });
    } catch (e) {
      Logger.error(`Failed to create audit log: ${e}`);
    }
  }

  private async logError(
    userId: string,
    message: string,
    stack: string,
    context?: any,
  ) {
    try {
      await this.errorLogRepo.create({
        data: {
          serviceName: 'GenerateImageService',
          severity: 'ERROR',
          message,
          stackTrace: stack,
          context: context,
          userId,
        } as any,
      });
    } catch (e) {
      Logger.error(`Failed to create error log: ${e}`);
    }
  }

  public signBytePlusRequest(
    method: string,
    path: string,
    queryParams: Record<string, string>,
    body: any,
    accessKey: string,
    secretKey: string,
  ) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const crypto = require('crypto');
    const region = 'ap-singapore-1';
    const service = 'cv';
    const contentType = 'application/json';
    const host = 'cv.byteplusapi.com';

    const now = new Date();
    const x_date = now.toISOString().replace(/[:-]|\.\d{3}/g, ''); // YYYYMMDDTHHMMSSZ
    const short_date = x_date.slice(0, 8);

    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
    const x_content_sha256 = crypto
      .createHash('sha256')
      .update(bodyStr)
      .digest('hex');

    const queryString = Object.keys(queryParams)
      .sort()
      .map(
        (key) =>
          `${encodeURIComponent(key)}=${encodeURIComponent(queryParams[key])}`,
      )
      .join('&');

    const canonicalHeaders =
      `content-type:${contentType}\n` +
      `host:${host}\n` +
      `x-content-sha256:${x_content_sha256}\n` +
      `x-date:${x_date}\n`;

    const signedHeaders = 'content-type;host;x-content-sha256;x-date';

    const canonicalRequest = [
      method,
      path,
      queryString,
      canonicalHeaders,
      signedHeaders,
      x_content_sha256,
    ].join('\n');

    const credentialScope = `${short_date}/${region}/${service}/request`;

    const stringToSign = [
      'HMAC-SHA256',
      x_date,
      credentialScope,
      crypto.createHash('sha256').update(canonicalRequest).digest('hex'),
    ].join('\n');

    const kDate = crypto
      .createHmac('sha256', secretKey)
      .update(short_date)
      .digest();
    const kRegion = crypto.createHmac('sha256', kDate).update(region).digest();
    const kService = crypto
      .createHmac('sha256', kRegion)
      .update(service)
      .digest();
    const kSigning = crypto
      .createHmac('sha256', kService)
      .update('request')
      .digest();

    const signature = crypto
      .createHmac('sha256', kSigning)
      .update(stringToSign)
      .digest('hex');

    const authorization = `HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return {
      'Content-Type': contentType,
      Host: host,
      'X-Content-Sha256': x_content_sha256,
      'X-Date': x_date,
      Authorization: authorization,
    };
  }

  async updateHoldCreditBalance(
    userId: string,
    organizationId: string,
    projectId: string,
    unitType: 'image' | 'credit',
    amount: number,
  ) {
    try {
      await this.projectMemberRepo.updateMany({
        where: { userId: userId, projectId: projectId },
        data:
          unitType === 'image'
            ? { holdImageAllowance: { increment: amount } }
            : { holdCreditAllowance: { increment: amount } },
      });
      // console.log('projectMember update data', data);

      // const creditBalanceData = await this.creditBalanceRepo.update({
      //   where: { organizationId: organizationId },
      //   data:
      //     unitType === 'image'
      //       ? { holdImage: { increment: amount } }
      //       : { holdBalance: { increment: amount } },
      // });
    } catch (error) {
      Logger.error(`Failed to update hold credit balance: ${error}`);
    }
  }

  async getUsedCredit(
    token: number,
    body: any,
    model?: MasterModelTypeDto,
  ): Promise<{ token: number; credit: number } | undefined> {
    try {
      // 1. Dynamic Formula Check
      if (
        model?.modelDetails &&
        (model.modelDetails.calculationType === 'FORMULA' ||
          model.modelDetails.calculationType === 'USE_TOKEN' ||
          model.modelDetails.calculationType === 'NOT_USE_TOKEN')
      ) {
        try {
          const { calculationType, tokenFormula, creditFormula, formula } =
            model.modelDetails;
          let calculatedToken = token;
          let calculatedCredit = 0;
          const evaluate = (expr: string, t: number, b: any) => {
            if (!expr) return 0;
            const isExpr = !expr.includes(';') && !expr.includes('return ');
            const code = isExpr ? `return ${expr};` : expr;
            const evalFn = new Function(
              'token',
              'body',
              `"use strict"; ${code}`,
            );
            return evalFn(t, b);
          };

          if (calculationType === 'NOT_USE_TOKEN') {
            calculatedToken = 0;
            calculatedCredit = evaluate(
              creditFormula || formula,
              calculatedToken,
              body,
            );
          } else if (calculationType === 'USE_TOKEN') {
            if (token > 0) {
              calculatedToken = token;
            } else if (tokenFormula) {
              calculatedToken = evaluate(tokenFormula, token, body);
            } else {
              calculatedToken = 0;
            }
            calculatedCredit = evaluate(
              creditFormula || formula,
              calculatedToken,
              body,
            );
          } else if (calculationType === 'FORMULA') {
            calculatedCredit = evaluate(formula, token, body);
            if (model.type === 'image') calculatedToken = 0;
          }

          if (
            typeof calculatedCredit === 'number' &&
            !isNaN(calculatedCredit)
          ) {
            return { token: calculatedToken, credit: calculatedCredit };
          } else {
            return undefined;
          }
        } catch (err) {
          console.error(
            'Error evaluating dynamic formula, falling back to default logic:',
            err,
          );
          return undefined;
        }
      }

      // 2. Existing Hardcoded Logic (Fallback)
      if (model.type === 'image') {
        const credit = body.images * 10;
        const outToken = 0;
        return { token: outToken, credit };
      } else if (model.type === 'video') {
        // const perCredit = 1186.813;
        const pixels = body.width * body.height;
        let creditPerSec = 0;
        const hasAudio =
          body.generateAudio === true || body.generateAudio === 'Yes'; // เช็กว่ามีเสียงไหม

        // คำนวณ Resolution ตามพื้นที่ (Size px) อ้างอิงจากตาราง Excel
        if (pixels <= 450000) {
          // ครอบคลุมกลุ่ม 480p (เช่น 864x496 = 428,544)
          creditPerSec = hasAudio ? 15 : 10;
        } else if (pixels <= 950000) {
          // ครอบคลุมกลุ่ม 720p (เช่น 1280x720 = 921,600)
          creditPerSec = hasAudio ? 25 : 20;
        } else {
          // ครอบคลุมกลุ่ม 1080p (เช่น 1920x1080 = 2,073,600)
          creditPerSec = hasAudio ? 45 : 40;
        }
        return {
          token,
          credit: creditPerSec * body.duration,
          // credit: Math.round(token / perCredit)
        };
      } else if (model.type === 'omnihumen') {
        const credit = body.duration * 45;
        const outToken = body.duration * 49846.15385;
        return { token: outToken, credit };
      } else if (model.type === 'dreamactor') {
        const credit = body.duration * 30;
        const outToken = body.duration * 20769.23077;
        return { token: outToken, credit };
      }
    } catch (err) {
      return err;
    }
  }

  async getUsedCreditBak(
    token: number,
    body: any,
    model: MasterModelTypeDto,
  ): Promise<{ token: number; credit: number }> {
    try {
      if (model.type === 'image') {
        const credit = body.images * 10;
        const token = 0;
        return { token, credit };
      } else if (model.type === 'video') {
        // const perCredit = 1186.813;
        const pixels = body.width * body.height;
        let creditPerSec = 0;
        const hasAudio =
          body.generateAudio === true || body.generateAudio === 'Yes'; // เช็กว่ามีเสียงไหม

        // คำนวณ Resolution ตามพื้นที่ (Size px) อ้างอิงจากตาราง Excel
        if (pixels <= 450000) {
          // ครอบคลุมกลุ่ม 480p (เช่น 864x496 = 428,544)
          creditPerSec = hasAudio ? 15 : 10;
        } else if (pixels <= 950000) {
          // ครอบคลุมกลุ่ม 720p (เช่น 1280x720 = 921,600)
          creditPerSec = hasAudio ? 25 : 20;
        } else {
          // ครอบคลุมกลุ่ม 1080p (เช่น 1920x1080 = 2,073,600)
          creditPerSec = hasAudio ? 45 : 40;
        }
        return {
          token,
          credit: creditPerSec * body.duration,
          // credit: Math.round(token / perCredit)
        };
      } else if (model.type === 'omnihumen') {
        const credit = body.duration * 45;
        const token = body.duration * 49846.15385;
        return { token, credit };
      } else if (model.type === 'dreamactor') {
        const credit = body.duration * 30;
        const token = body.duration * 20769.23077;
        return { token, credit };
      }
    } catch (err) {
      return err;
    }
  }
  async getCreditPreSend(body: any) {
    if (!body.model) {
      throw new Error('Model not found');
    }
    const modelDetail = await this.modeltypeRepo.findOne({
      where: { modelType: body.model, type: body.type },
    });
    if (!modelDetail) {
      throw new Error('Model not found');
    }
    const credit = await this.getUsedCredit(0, body, modelDetail);
    return credit?.credit || 0;
  }
  //ลบ hold image allowance ถ้า fail
  cancelHoldAmount(
    holdCreditAllowance: number,
    userId: string,
    projectId: string,
  ) {
    this.projectMemberRepo.updateMany({
      where: { userId: userId, projectId: projectId },
      data: { holdCreditAllowance: { decrement: holdCreditAllowance } },
    });
  }
}
