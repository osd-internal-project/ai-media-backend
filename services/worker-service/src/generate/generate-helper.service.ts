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
} from '@ai-media/share';
import { tosConfigs } from 'src/configs';

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
  ) {}

  //Update Credit When Generate Fail
  async updateUsedCreditFail(
    userId: string,
    organizationId: string,
    projectId: string,
    unitType: 'image' | 'credit',
    amount: number,
  ): Promise<any> {
    try {
      await this.projectMemberRepo.updateMany({
        where: { userId: userId, projectId: projectId },
        data:
          unitType === 'image'
            ? {
                holdImageAllowance: { decrement: amount },
              }
            : {
                holdCreditAllowance: { decrement: amount },
              },
      });
      return await this.projectMemberRepo.findOne({
        where: { userId: userId, projectId: projectId },
      });
    } catch (err) {
      return err;
    }
  }

  //Update Credit When Generate Success
  async updateUsedCreditSuccess(
    userId: string,
    organizationId: string,
    projectId: string,
    unitType: 'image' | 'credit',
    trueAmount: number,
    calculateAmount?: number,
  ) {
    try {
      const updatedProjectMember = await this.projectMemberRepo.updateMany({
        where: { userId: userId, projectId: projectId },
        data: {
          holdCreditAllowance: {
            decrement: calculateAmount || trueAmount,
          },
          usedCreditAllowance: { increment: trueAmount },
        },
      });
      if (updatedProjectMember) {
        await this.projectRepo.updateMany({
          where: { id: projectId },
          data: {
            usedCreditAllowance: { increment: trueAmount },
          },
        });
        const creditBalance = await this.creditBalanceRepo.findOne({
          where: { organizationId },
        });
        let decrementOnTop = 0;
        let decrementCycle = 0;

        if (creditBalance.currentCycleBalance < trueAmount) {
          decrementOnTop = trueAmount - creditBalance.currentCycleBalance;
          decrementCycle = creditBalance.currentCycleBalance || 0;
        } else {
          decrementCycle = trueAmount;
        }
        await this.creditBalanceRepo.update({
          where: { organizationId: organizationId },
          data: {
            currentCycleBalance: { decrement: decrementCycle },
            onTopBalance: { decrement: decrementOnTop },
          },
        });
        //   if (updatedProjectMember) {
        //     const updateProject = await this.projectRepo.update({
        //       where: { id: projectId },
        //       data:
        //         unitType === 'image'
        //           ? { usedImageAllowance: { increment: amount } }
        //           : { usedCreditAllowance: { increment: amount } },
        //     });
        //     if (updateProject) {
        //       return await this.creditBalanceRepo.update({
        //         where: { organizationId: organizationId },
        //         data:
        //           unitType === 'image'
        //             ? {
        //                 currentCycleImage: { decrement: amount },
        //               }
        //             : {
        //                 currentCycleBalance: { decrement: amount },
        //               },
        //       });
        //     }
        //   }
      }
      return await this.projectMemberRepo.findOne({
        where: { userId: userId, projectId: projectId },
      });
    } catch (err) {
      Logger.error(`Failed to update used credit: ${err}`);
      return undefined;
    }
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
