import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import * as https from 'https';
import * as path from 'path';
import {
  RequestImageGenerateDto,
  GalleryRepository,
  LogRepository,
  QUEUE_NAME_IMAGE,
  RefImageRepository,
  TosService,
  ProjectRepository,
  ProjectMemberRepository,
  CreditBalanceRepository,
  MasterdataModelTypeRepository,
  MasterModelTypeDto,
  ErrorLogRepository,
  AuditLogRepository,
  PrismaService,
} from '@ai-media/share';
import { tosConfigs } from 'src/configs';

/** Member counters after a settle/refund — what callers publish as used credit */
export interface MemberCredit {
  usedCreditAllowance: number;
  holdCreditAllowance: number;
}

// longer than any job can live (retries + sweeper) so a late path still sees the claim
const SETTLEMENT_TTL_SECONDS = 7 * 24 * 60 * 60;
const settlementKey = (taskId: string) => `credit:settled:${taskId}`;

@Injectable()
export class GenerateHelperService {
  constructor(
    private readonly galleryRepo: GalleryRepository,
    private readonly auditLogRepo: AuditLogRepository,
    private readonly errorLogRepo: ErrorLogRepository,
    private readonly refImageRepository: RefImageRepository,
    private readonly tosService: TosService,
    private readonly creditBalanceRepo: CreditBalanceRepository,
    private readonly projectRepo: ProjectRepository,
    private readonly projectMemberRepo: ProjectMemberRepository,
    private readonly masterModelTypeRepo: MasterdataModelTypeRepository,
    private readonly prisma: PrismaService,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  /**
   * Claim the one settlement a task may have (charge or refund). Retries, sweeper and
   * fail-after-success paths all reach here; only the first claim may touch credit.
   */
  private async claimSettlement(
    taskId: string,
    outcome: 'charged' | 'refunded',
  ): Promise<boolean> {
    const key = settlementKey(taskId);
    const claimed = await this.redis.set(
      key,
      outcome,
      'EX',
      SETTLEMENT_TTL_SECONDS,
      'NX',
    );
    if (claimed === 'OK') return true;
    Logger.warn(
      `[credit][${taskId}] already ${await this.redis.get(key)} — skip ${outcome}`,
    );
    return false;
  }

  private async memberCredit(
    userId: string,
    projectId: string,
  ): Promise<MemberCredit> {
    const member = await this.projectMemberRepo.findOne({
      where: { userId, projectId },
    });
    return {
      usedCreditAllowance: member?.usedCreditAllowance ?? 0,
      holdCreditAllowance: member?.holdCreditAllowance ?? 0,
    };
  }

  /** Release the task's hold without charging — at most once per task. Throws on DB failure. */
  async updateUsedCreditFail(
    taskId: string,
    userId: string,
    _organizationId: string,
    projectId: string,
    unitType: 'image' | 'credit',
    amount: number,
  ): Promise<MemberCredit> {
    if (await this.claimSettlement(taskId, 'refunded')) {
      try {
        if (unitType === 'image') {
          await this.prisma.$executeRaw`
            UPDATE project_member
               SET hold_image_allowance = GREATEST(hold_image_allowance - ${amount}, 0)
             WHERE project_id = ${projectId} AND user_id = ${userId}`;
        } else {
          await this.prisma.$executeRaw`
            UPDATE project_member
               SET hold_credit_allowance = GREATEST(hold_credit_allowance - ${amount}, 0)
             WHERE project_id = ${projectId} AND user_id = ${userId}`;
        }
      } catch (err) {
        await this.redis.del(settlementKey(taskId));
        Logger.error(`[credit][${taskId}] refund ${amount} failed: ${err}`);
        throw err;
      }
    }
    return this.memberCredit(userId, projectId);
  }

  /**
   * Charge `trueAmount` to member, project and org and release the hold
   * (`calculateAmount` = what core held, defaults to `trueAmount`) — one transaction,
   * at most once per task. The org pays from the cycle balance first, then on-top.
   */
  async updateUsedCreditSuccess(
    taskId: string,
    userId: string,
    organizationId: string,
    projectId: string,
    _unitType: 'image' | 'credit',
    trueAmount: number,
    calculateAmount?: number,
  ): Promise<MemberCredit> {
    if (await this.claimSettlement(taskId, 'charged')) {
      const held = calculateAmount || trueAmount;
      try {
        // SET expressions read the pre-update row, so the cycle/on-top split is atomic
        await this.prisma.$transaction([
          this.prisma.$executeRaw`
            UPDATE project_member
               SET hold_credit_allowance = GREATEST(hold_credit_allowance - ${held}, 0),
                   used_credit_allowance = used_credit_allowance + ${trueAmount}
             WHERE project_id = ${projectId} AND user_id = ${userId}`,
          this.prisma.$executeRaw`
            UPDATE project
               SET used_credit_allowance = used_credit_allowance + ${trueAmount}
             WHERE id = ${projectId}`,
          this.prisma.$executeRaw`
            UPDATE credit_balances
               SET current_cycle_balance = current_cycle_balance
                     - LEAST(GREATEST(current_cycle_balance, 0), ${trueAmount}),
                   on_top_balance = on_top_balance
                     - (${trueAmount} - LEAST(GREATEST(current_cycle_balance, 0), ${trueAmount}))
             WHERE organization_id = ${organizationId}`,
        ]);
      } catch (err) {
        await this.redis.del(settlementKey(taskId));
        Logger.error(`[credit][${taskId}] charge ${trueAmount} failed: ${err}`);
        throw err;
      }
    }
    return this.memberCredit(userId, projectId);
  }


  // async getUsedCredit(
  //   token: number,
  //   body: any,
  //   modelName: string,
  // ): Promise<{ token: number; credit: number }> {
  //   try {
  //     const model = await this.masterModelTypeRepo.findOne({
  //       where: { modelType: modelName },
  //     });

  //     // 1. Dynamic Formula Check
  //     const modelDetails = model?.modelDetails as any;

  //     if (
  //       modelDetails &&
  //       (modelDetails.calculationType === 'FORMULA' ||
  //         modelDetails.calculationType === 'USE_TOKEN' ||
  //         modelDetails.calculationType === 'NOT_USE_TOKEN')
  //     ) {
  //       try {
  //         const { calculationType, tokenFormula, creditFormula, formula } =
  //           modelDetails;
  //         let calculatedToken = token;
  //         let calculatedCredit = 0;

  //         const evaluate = (expr: string, t: number, b: any) => {
  //           if (!expr) return 0;
  //           const isExpr = !expr.includes(';') && !expr.includes('return ');
  //           const code = isExpr ? `return ${expr};` : expr;
  //           const evalFn = new Function(
  //             'token',
  //             'body',
  //             `"use strict"; ${code}`,
  //           );
  //           return evalFn(t, b);
  //         };

  //         if (calculationType === 'NOT_USE_TOKEN') {
  //           calculatedToken = 0;
  //           calculatedCredit = evaluate(
  //             creditFormula || formula,
  //             calculatedToken,
  //             body,
  //           );
  //         } else if (calculationType === 'USE_TOKEN') {
  //           if (token > 0) {
  //             calculatedToken = token;
  //           } else if (tokenFormula) {
  //             calculatedToken = evaluate(tokenFormula, token, body);
  //           } else {
  //             calculatedToken = 0;
  //           }
  //           calculatedCredit = evaluate(
  //             creditFormula || formula,
  //             calculatedToken,
  //             body,
  //           );
  //         } else if (calculationType === 'FORMULA') {
  //           calculatedCredit = evaluate(formula, token, body);
  //           if (model.type === 'image') calculatedToken = 0;
  //         }

  //         if (
  //           typeof calculatedCredit === 'number' &&
  //           !isNaN(calculatedCredit)
  //         ) {
  //           return { token: calculatedToken, credit: calculatedCredit };
  //         }
  //       } catch (err) {
  //         console.error(
  //           'Error evaluating dynamic formula, falling back to default logic:',
  //           err,
  //         );
  //       }
  //     }

  //     if (modelName === 'seedance-1-5-pro-251215') {
  //       const perCredit = 1186.813;
  //       return { token, credit: Math.round(token / perCredit) };
  //     } else if (modelName === 'realman_avatar_picture_omni15_cv') {
  //       const credit = body.duration * 42;
  //       const outToken = body.duration * 49846.15385;
  //       return { token: outToken, credit };
  //     } else if (modelName === 'dreamactor_m20_gen_video_cvtob') {
  //       const credit = body.duration * 17.5;
  //       const outToken = body.duration * 20769.23077;
  //       return { token: outToken, credit };
  //     }
  //   } catch (err) {
  //     return err;
  //   }
  // }

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

  async logAudit(
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

  async logError(
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
}
