import {
  AuditLogRepository,
  CreditBalanceRepository,
  ErrorLogRepository,
  MasterModelTypeDto,
  MasterdataModelTypeRepository,
  ProjectMemberRepository,
  ProjectRepository,
  PrismaService,
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
import { Prisma } from '@prisma/client';

/**
 * Credit amounts always bind as numeric. A plain JS number lets Prisma pick int or float per
 * call, and the per-connection statement cache then rejects the other kind (22P03).
 */
/** 'video' → 'Video', for audit entity and error-log service names */
const typeLabel = (type: string) =>
  type.charAt(0).toUpperCase() + type.slice(1);

const credit = (amount: number | null) =>
  amount === null ? null : new Prisma.Decimal(amount);
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
    private readonly prisma: PrismaService,
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

    const project = await this.projectRepo.findOne({
      where: { id: projectId },
      select: { organizationId: true },
    });
    // A member disabled in the project's organization counts as not a member
    const projectMember = await this.projectMemberRepo.findOne({
      where: {
        projectId: projectId,
        userId: user.userId,
        ...(project?.organizationId && {
          users: {
            organizationMembers: {
              none: {
                organizationId: project.organizationId,
                status: 'inactive',
              },
            },
          },
        }),
      },
    });

    return { user, projectMember, organizationId: project?.organizationId };
  }

  public async logAudit(
    userId: string,
    action: string,
    details: any,
    entityId: string,
    type: string,
  ) {
    try {
      await this.auditLogRepo.create({
        data: {
          userId,
          action: 'CREATE',
          entityName: `Generate${typeLabel(type)}`,
          entityId,
          newValues: details,
        } as any,
      });
    } catch (e) {
      Logger.error(`Failed to create audit log: ${e}`);
    }
  }

  private async logError(
    type: string,
    userId: string,
    message: string,
    stack: string,
    context?: any,
  ) {
    try {
      await this.errorLogRepo.create({
        data: {
          serviceName: `Generate${typeLabel(type)}Service`,
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

  public handleGenerationError(error: any, userId: string, type: string) {
    Logger.error(
      `Error generate ${type}: ${
        error?.response?.data?.error_description || error.message
      }`,
      error?.response?.data ? JSON.stringify(error.response.data) : error.stack,
    );
    if (axios.isAxiosError(error) && error.response) {
      const { data } = error.response;
      const message = data?.error?.message || '';

      this.logError(type, userId, message, error.stack, data);
      throw new ConflictException(message);
    }

    throw new InternalServerErrorException(`Failed to generate ${type}`);
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

  /**
   * Reserve `amount` on the member only if used + hold + amount stays within the limit.
   * One conditional UPDATE, so concurrent requests cannot both pass the check.
   */
  async reserveHold(
    userId: string,
    projectId: string,
    amount: number,
  ): Promise<boolean> {
    const rows = await this.prisma.$executeRaw`
      UPDATE project_member
         SET hold_credit_allowance = hold_credit_allowance + ${credit(
           amount,
         )}::numeric
       WHERE project_id = ${projectId} AND user_id = ${userId}
         AND used_credit_allowance + hold_credit_allowance + ${credit(
           amount,
         )}::numeric
             <= COALESCE(limit_credit_allowance, 0)`;
    return rows > 0;
  }

  /** Release a hold reserved by reserveHold; floored at 0 so a reset row never goes negative */
  async cancelHoldAmount(
    holdCreditAllowance: number,
    userId: string,
    projectId: string,
  ) {
    await this.prisma.$executeRaw`
      UPDATE project_member
         SET hold_credit_allowance = GREATEST(hold_credit_allowance - ${credit(
           holdCreditAllowance,
         )}::numeric, 0)
       WHERE project_id = ${projectId} AND user_id = ${userId}`;
  }

  /** Credit still free for new work: project limit and org balance minus what is used or held */
  async getAvailableCredit(
    projectId: string,
    organizationId: string,
  ): Promise<{ project: number; organization: number }> {
    const [row] = await this.prisma.$queryRaw<
      { project_free: number | null; org_free: number | null }[]
    >`
      SELECT
        (SELECT p.limit_credit_allowance - p.used_credit_allowance
                - COALESCE((SELECT SUM(hold_credit_allowance) FROM project_member WHERE project_id = p.id), 0)
           FROM project p WHERE p.id = ${projectId}) AS project_free,
        (SELECT cb.current_cycle_balance + cb.on_top_balance
                - COALESCE((SELECT SUM(pm.hold_credit_allowance)
                              FROM project_member pm JOIN project p ON p.id = pm.project_id
                             WHERE p.organization_id = ${organizationId}), 0)
           FROM credit_balances cb WHERE cb.organization_id = ${organizationId}) AS org_free`;
    return {
      project: Number(row?.project_free ?? 0),
      organization: Number(row?.org_free ?? 0),
    };
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
      } else if (model.type === 'audio') {
        // audio ไม่มีราคา hardcode — ต้องตั้ง modelDetails.calculationType ใน master_model_type
        Logger.error(
          `audio model ${model.modelType} has no modelDetails.calculationType`,
        );
        return undefined;
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
