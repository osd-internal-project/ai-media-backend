import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  OrganizationSubscriptionRepository,
  CreditBalanceRepository,
  PackageTransactionRepository,
  PlanRepository,
  PrismaService,
} from '@ai-media/share';
import * as dayjs from 'dayjs';

@Injectable()
export class OrganizationSubscriptionCron {
  private readonly logger = new Logger(OrganizationSubscriptionCron.name);

  constructor(
    private readonly organizationSubscriptionRepo: OrganizationSubscriptionRepository,
    private readonly creditBalanceRepo: CreditBalanceRepository,
    private readonly packageTransactionRepo: PackageTransactionRepository,
    private readonly planRepo: PlanRepository,
    private readonly prisma: PrismaService,
  ) {}

  @Cron('0 23 * * *') // run once a day at 23:00.
  async handleSubscriptionRenewal() {
    this.logger.log('Running subscription renewal check...');
    const now = dayjs();
    const tomorrowStart = now.add(1, 'day').startOf('day').toDate();
    const tomorrowEnd = now.add(1, 'day').endOf('day').toDate();

    try {
      // 1. Check for package transactions that start tomorrow and activate subscription
      const pendingTransactions = await this.packageTransactionRepo.findMany({
        where: {
          billingPeriodStart: {
            gte: tomorrowStart,
            lte: tomorrowEnd,
          },
        },
      });

      for (const tx of pendingTransactions) {
        try {
          // find the existing org subscription to get the plan details
          const sub = await this.organizationSubscriptionRepo.findOne({
            where: { organizationId: tx.organizationId },
          });

          if (sub) {
            const plan = await this.planRepo.findOne({ where: { id: sub.planId } });
            const planDetails = plan?.detailJson as any;
            const duration = +(planDetails?.duration || 1);
            const durationUnit = planDetails?.unit || 'month';
            
            this.logger.log(`Activating subscription for org ${tx.organizationId} from transaction ${tx.id}`);
            
            const currentStart = dayjs(tx.billingPeriodStart);
            const currentEnd = currentStart.add(duration, durationUnit as dayjs.ManipulateType).toDate();

            await this.prisma.$transaction(async (prismaTx) => {
              await prismaTx.organizationSubscription.update({
                where: { id: sub.id },
                data: {
                  status: 'active',
                  currentPeriodStart: tx.billingPeriodStart,
                  currentPeriodEnd: currentEnd,
                  nextBillingDate: tx.billingPeriodEnd,
                  periodCurrent: 1,
                  
                  // Keep the existing allowance snapshot
                },
              });

              await prismaTx.creditBalance.upsert({
                where: { organizationId: tx.organizationId },
                update: {
                  currentCycleBalance: sub.creditAllowance,
                  currentCycleImage: sub.imageAllowance,
                },
                create: {
                  organizationId: tx.organizationId,
                  currentCycleBalance: sub.creditAllowance,
                  currentCycleImage: sub.imageAllowance,
                  onTopBalance: 0,
                  onTopImage: 0,
                  holdBalance: 0,
                  holdImage: 0,
                },
              });
            });
          }
        } catch (error) {
          this.logger.error(`Error processing pending transaction ${tx.id}: ${error.message}`);
        }
      }
    } catch (error) {
      this.logger.error(`Error processing future subscriptions: ${error.message}`);
    }

    try {
      // Find all active subscriptions whose currentPeriodEnd is passed or is exactly now
      const subscriptions = await this.organizationSubscriptionRepo.findMany({
        where: {
          status: 'active',
          currentPeriodEnd: {
            lte: now.toDate(),
          },
        },
      });

      for (const sub of subscriptions) {
        try {
          // หากถึง currentPeriodEnd
          const isReachCurrentPeriodEnd = now.toDate() >= sub.currentPeriodEnd;

          if (isReachCurrentPeriodEnd) {
            // หากยังไม่ถึง nextBillingDate และ periodCount != periodCurrent
            const isNotReachNextBillingDate = now.toDate() < sub.nextBillingDate;

            if (isNotReachNextBillingDate && sub.periodCount !== sub.periodCurrent) {
              this.logger.log(`Renew period for sub: ${sub.id}`);

              const newPeriodStart = sub.currentPeriodEnd;
              // Add period based on plan interval (assuming sub.period holds 'month' or 'year' or sub.interval)
              const intervalUnit = (sub.interval || sub.period || 'month').toLowerCase() as dayjs.ManipulateType;
              const newPeriodEnd = dayjs(newPeriodStart).add(1, intervalUnit).toDate();

              await this.prisma.$transaction(async (tx) => {
                // update currentPeriodStart, currentPeriodEnd, periodCurrent
                await tx.organizationSubscription.update({
                  where: { id: sub.id },
                  data: {
                    currentPeriodStart: newPeriodStart,
                    currentPeriodEnd: newPeriodEnd,
                    periodCurrent: sub.periodCurrent + 1,
                  },
                });

                // update creditBalance ใหม่ตาม plan
                await tx.creditBalance.update({
                  where: { organizationId: sub.organizationId },
                  data: {
                    currentCycleBalance: sub.creditAllowance,
                    currentCycleImage: sub.imageAllowance,
                  },
                });
              });
            } else if (!isNotReachNextBillingDate ) {
              // หากถึง nextBillingDate และ periodCount = periodCurrent ให้สร้าง package transection ใหม่ด้วย
              this.logger.log(`Create package transaction for sub: ${sub.id}`);

              const billingStart = sub.currentPeriodEnd;
              const intervalUnit = (sub.interval || sub.period || 'month').toLowerCase() as dayjs.ManipulateType;
              const billingEnd = dayjs(billingStart).add(1, intervalUnit).toDate();

              await this.prisma.$transaction(async (tx) => {
                await tx.packageTransaction.create({
                  data: {
                    organizationId: sub.organizationId,
                    amountPaid: sub.price,
                    currency: 'THB',
                    status: 'WAIT', // รอการชำระเงิน
                    planName: sub.planName,
                    planInterval: sub.interval || sub.period || 'monthly',
                    billingPeriodStart: billingStart,
                    billingPeriodEnd: billingEnd,
                  },
                });

                // Update subscription status
                await tx.organizationSubscription.update({
                  where: { id: sub.id },
                  data: {
                    status: 'inactive',
                  },
                });

                // Reset credits to 0
                await tx.creditBalance.update({
                  where: { organizationId: sub.organizationId },
                  data: {
                    currentCycleBalance: 0,
                    currentCycleImage: 0,
                  },
                });
              });
            }
          }
        } catch (error) {
          this.logger.error(`Error processing subscription ${sub.id}: ${error.message}`);
        }
      }
    } catch (error) {
      this.logger.error(`Error fetching subscriptions: ${error.message}`);
    }
  }
}
