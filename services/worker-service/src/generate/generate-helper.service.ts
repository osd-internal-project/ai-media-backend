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
} from '@ai-media/share';
import { tosConfigs } from 'src/configs';

@Injectable()
export class GenerateHelperService {
  constructor(
    private readonly galleryRepo: GalleryRepository,
    private readonly logrepo: LogRepository,
    private readonly refImageRepository: RefImageRepository,
    private readonly tosService: TosService,
    private readonly creditBalanceRepo: CreditBalanceRepository,
    private readonly projectRepo: ProjectRepository,
    private readonly projectMemberRepo: ProjectMemberRepository,
  ) {}

  //Update Credit When Generate Fail
  async updateUsedCreditFail(
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
        data:
          unitType === 'image'
            ? {
                holdImageAllowance: { decrement: calculateAmount || trueAmount },
                usedImageAllowance: { increment: trueAmount },
              }
            : {
                holdCreditAllowance: { decrement: calculateAmount || trueAmount },
                usedCreditAllowance: { increment: trueAmount },
              },
      });
      if (updatedProjectMember) {
        await this.projectRepo.updateMany({
          where: { id: projectId },
          data:
            unitType === 'image'
              ? {
                  // holdImageAllowance: { decrement: calculateAmount || trueAmount },
                  usedImageAllowance: { increment: trueAmount },
                }
              : {
                  // holdCreditAllowance: { decrement: calculateAmount || trueAmount },
                  usedCreditAllowance: { increment: trueAmount },
                },
        });
        const creditBalance = await this.creditBalanceRepo.findOne({
          where: { organizationId },
        });
        let decrementOnTop = 0;
        let decrementCycle = 0;
        if (unitType === 'image') {
          if (creditBalance.currentCycleImage < trueAmount) {
            decrementOnTop = trueAmount - creditBalance.currentCycleImage;
            decrementCycle = creditBalance.currentCycleImage || 0;
          } else {
            decrementCycle = trueAmount;
          }
        } else {
          if (creditBalance.currentCycleBalance < trueAmount) {
            decrementOnTop = trueAmount - creditBalance.currentCycleBalance;
            decrementCycle = creditBalance.currentCycleBalance || 0;
          } else {
            decrementCycle = trueAmount;
          }
        }

        await this.creditBalanceRepo.update({
          where: { organizationId: organizationId },
          data:
            unitType === 'image'
              ? {
                  currentCycleImage: { decrement: decrementCycle },
                  onTopImage: { decrement: decrementOnTop },
                }
              : {
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
      return err;
    }
  }

  async getUsedCredit(
    token: number,
    body: any,
    model: string,
  ): Promise<{ token: number; credit: number }> {
    try {
      if (model === 'seedance-1-5-pro-251215') {
        const perCredit = 1186.813;
        return { token, credit: Math.round(token / perCredit) };
      } else if (model === 'realman_avatar_picture_omni15_cv') {
        const credit = body.duration * 42;
        const token = body.duration * 49846.15385;
        return { token, credit };
      } else if (model === 'dreamactor_m20_gen_video_cvtob') {
        const credit = body.duration * 17.5;
        const token = body.duration * 20769.23077;
        return { token, credit };
      }
    } catch (err) {
      return err;
    }
  }
}
