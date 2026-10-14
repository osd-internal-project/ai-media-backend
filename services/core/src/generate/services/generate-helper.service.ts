import {
  AuditLogRepository,
  CreditBalanceRepository,
  ErrorLogRepository,
  MasterModelTypeDto,
  MasterdataModelTypeRepository,
  ProjectMemberRepository,
  ProjectRepository,
  StorageUrlService,
  UsersRepository,
} from '@ai-media/share';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import axios from 'axios';
interface FieldMapping {
  to: string; // ชื่อ field ใน payload
  from: string | string[]; // ชื่อ field จาก body (1 หรือหลาย field)
  template?: string; // เช่น "{width}x{height}" ถ้าต้องรวมหลาย field
  transform?: (val: unknown) => unknown; // optional custom transform
}

interface ModelConfig {
  staticFields?: Record<string, unknown>;
  fieldMappings: FieldMapping[];
}
/**
 * GenerateHelperService
 * Contains shared utility methods used by all generate sub-services.
 * Extracted to avoid circular dependency with GenerateService.
 */
@Injectable()
export class GenerateHelperService {
  constructor(
    private readonly userRepo: UsersRepository,
    private readonly projectMemberRepo: ProjectMemberRepository,
    private readonly projectRepo: ProjectRepository,
    private readonly errorLogRepo: ErrorLogRepository,
    private readonly auditLogRepo: AuditLogRepository,
    private readonly masterModelTypeRepo: MasterdataModelTypeRepository,
    private readonly creditBalanceRepo: CreditBalanceRepository,
    private readonly storageUrl: StorageUrlService,
  ) {}

  /**
   * รวบรวม reference image ทั้งหมดของ request เป็น "object key" ชุดเดียว
   *
   * รองรับทั้งสอง shape ที่ frontend ส่งมา:
   *  - `image[]` — first/last frame (seedance1, image, omnihuman, dreamactor)
   *  - `files[]` — multi-reference (seedance2) ซึ่งเดิมถูกมองข้ามจนรูปอ้างอิงหายตอนรีโหลด
   *
   * ค่าที่คืนเป็น key เสมอ (หรือ URL เดิมถ้า caller ส่ง URL มา) เหมาะกับการเก็บลง DB
   * ห้ามเอาไปแสดงผลตรง ๆ — ใช้ toReferenceDisplayUrls ก่อน
   *
   * @param body request body ที่อาจมี image และ/หรือ files
   * @returns list ของ reference key ที่ไม่ว่าง (ไม่ซ้ำ)
   */
  public collectReferenceKeys(body: {
    image?: (string | null)[];
    files?: { type: string; url: string }[];
  }): string[] {
    const fromImage = body.image ?? [];
    const fromFiles = (body.files ?? [])
      .filter((file) => file.type === 'image')
      .map((file) => file.url);
    const keys = [...fromImage, ...fromFiles].filter((key): key is string =>
      Boolean(key),
    );
    return [...new Set(keys)];
  }

  /**
   * แปลง reference key เป็น URL สำหรับส่งกลับใน API response
   *
   * response ต้องเป็น URL เสมอ เพราะ frontend เอาไปใส่ <img src> ตรง ๆ
   * (component *-smart-reference) — ถ้าส่ง key ออกไปจะได้รูปเสีย
   *
   * @param keys list ของ reference key (หรือ URL ที่ presign มาแล้ว)
   * @returns list ของ URL สำหรับแสดงผล
   */
  public toReferenceDisplayUrls(keys: readonly string[]): Promise<string[]> {
    return this.storageUrl.toDisplayUrls(keys);
  }

  async validateUserAndProject(userId: string, projectId: string) {
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

  public handleGenerationError(error: any, userId: string) {
    Logger.error(
      `Error generate image: ${
        error?.response?.data?.error_description || error.message
      }`,
      error?.response?.data ? JSON.stringify(error.response.data) : error.stack,
    );
    if (axios.isAxiosError(error) && error.response) {
      const { data } = error.response;
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
    } catch (error) {
      Logger.error(`Failed to update hold credit balance: ${error}`);
    }
  }

  async cancelHoldAmount(
    holdCreditAllowance: number,
    userId: string,
    projectId: string,
  ) {
    await this.projectMemberRepo.updateMany({
      where: { userId: userId, projectId: projectId },
      data: { holdCreditAllowance: { decrement: holdCreditAllowance } },
    });
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
              'pow',
              'abs',
              'min',
              'max',
              'round',
              'ceil',
              'floor',
              'ternary',
              `"use strict"; ${code}`,
            );
            return evalFn(
              t,
              b,
              Math.pow,
              Math.abs,
              Math.min,
              Math.max,
              Math.round,
              Math.ceil,
              Math.floor,
              (cond: boolean, a: unknown, b: unknown) => (cond ? a : b),
            );
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
            calculatedCredit = evaluate(creditFormula || formula, token, body);
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
        const pixels = body.width * body.height;
        let creditPerSec = 0;
        const hasAudio =
          body.generateAudio === true || body.generateAudio === 'Yes';

        if (pixels <= 450000) {
          creditPerSec = hasAudio ? 15 : 10;
        } else if (pixels <= 950000) {
          creditPerSec = hasAudio ? 25 : 20;
        } else {
          creditPerSec = hasAudio ? 45 : 40;
        }
        return {
          token,
          credit: creditPerSec * body.duration,
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
      Logger.error(`Failed to calculate credit: ${err}`);
      return undefined;
    }
  }

  async getCreditPreSend(body: any) {
    if (!body.model) {
      throw new Error('Model not found');
    }
    const modelDetail = await this.masterModelTypeRepo.findOne({
      where: { modelType: body.model, type: body.type, isActive: true },
    });
    if (!modelDetail) {
      throw new Error('Model not found');
    }
    const credit = await this.getUsedCredit(0, body, modelDetail);
    console.log('Pre-send credit calculation:', credit);
    return credit?.credit || 0;
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
    const x_date = now.toISOString().replace(/[:-]|\\.\\d{3}/g, '');
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

  public mapBodyToPayload(
    body: Record<string, unknown>,
    config: ModelConfig,
  ): Record<string, unknown> {
    const payload: Record<string, unknown> = {};

    // 1. ใส่ static fields จาก config ก่อน (stream, watermark ฯลฯ)
    if (config.staticFields) {
      Object.assign(payload, config.staticFields);
    }

    // 2. map แต่ละ field ตาม fieldMappings
    for (const mapping of config.fieldMappings) {
      const { to, from, template, transform } = mapping;

      let value: unknown;

      if (template) {
        // กรณีรวมหลาย field เช่น "{width}x{height}"
        const fields = Array.isArray(from) ? from : [from];
        const allExist = fields.every((f) => body[f] !== undefined);

        if (!allExist) continue; // ข้ามถ้า field ใด field หนึ่งไม่มี

        value = template.replace(/\{(\w+)\}/g, (_, key) => String(body[key]));
      } else {
        // กรณี 1-to-1 mapping
        const key = Array.isArray(from) ? from[0] : from;
        if (body[key] === undefined) continue; // ข้ามถ้าไม่มีใน body

        value = body[key];
      }

      // optional transform
      payload[to] = transform ? transform(value) : value;
    }

    return payload;
  }
}
