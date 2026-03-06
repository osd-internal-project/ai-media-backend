import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  CreditBalanceRepository,
  OrganizationRepository,
  OrganizationSubscriptionRepository,
  PackageTransactionRepository,
  PlanPriceRepository,
  PlanRepository,
  PrismaService,
} from '@ai-media/share';
import * as dayjs from 'dayjs';

@Injectable()
export class OrganizationSubscriptionService {
  constructor(
    private readonly organizationSubscriptionRepo: OrganizationSubscriptionRepository,
    // private readonly packageTransactionRepo: PackageTransactionRepository,
    private readonly creditBalanceRepo: CreditBalanceRepository,
    private readonly planRepo: PlanRepository,
    private readonly planPriceRepo: PlanPriceRepository,
    private readonly prisma: PrismaService,
    private readonly organizationRepo: OrganizationRepository,
    private readonly packageTransactionRepo: PackageTransactionRepository,
  ) {}

  findOne(id: string) {
    return this.organizationSubscriptionRepo.findOne({
      where: { id },
    });
  }

  findByOrganizationId(organizationId: string) {
    return this.organizationSubscriptionRepo.findOne({
      where: { organizationId },
    });
  }

  async restartSubscription(organizationId: string) {
    const sub = await this.organizationSubscriptionRepo.findOne({
      where: { organizationId },
    });
    if (!sub) throw new NotFoundException('Subscription not found');

    const plan = await this.planRepo.findOne({
      where: { id: sub.planId },
    });

    // nextBillingDate + 1 day

    const billingStart = dayjs().add(1, 'day').toDate();

    // plan length
    const periodCount = sub.periodCount || 1;
    const billingEnd = dayjs(billingStart).add(periodCount, 'month').toDate();

    return this.prisma.$transaction(async (tx) => {
      return tx.packageTransaction.create({
        data: {
          organizationId: sub.organizationId,
          amountPaid: sub.price,
          planId: plan.id,
          currency: 'THB',
          status: 'complete',
          paymentMethod: 'renewal',
          paidAt: new Date(),
          planName: plan?.name || sub.planName,
          planInterval: sub.interval || sub.period || 'monthly',
          billingPeriodStart: billingStart,
          billingPeriodEnd: billingEnd,
        },
      });
    });
  }

  async downgradeSubscription(organizationId: string, priceId: string) {
    const sub = await this.organizationSubscriptionRepo.findOne({
      where: { organizationId },
    });
    if (!sub) throw new NotFoundException('Subscription not found');

    const planPrice = await this.planPriceRepo.findOne({
      where: { id: priceId },
    });
    const plan = await this.planRepo.findOne({
      where: { id: planPrice?.planId },
    });
    return await this.organizationSubscriptionRepo.update({
      where: { id: sub.id },
      data: {
        nextPlanId: plan.id,
        nextPlanPriceId: priceId,
      },
    });
  }

  async upgradeSubscription(organizationId: string, priceId: string) {
    const sub = await this.organizationSubscriptionRepo.findOne({
      where: { organizationId },
    });
    if (!sub) throw new NotFoundException('Subscription not found');

    const planPrice = await this.planPriceRepo.findOne({
      where: { id: priceId },
    });
    if (!planPrice) throw new NotFoundException('Price plan not found');
    const plan = await this.planRepo.findOne({
      where: { id: planPrice?.planId },
    });
    if (!plan) throw new NotFoundException('Plan not found');
    if (plan.id === sub.planId) {
      //Change Billing Date
      const nextBillingDate = dayjs(sub.nextBillingDate);
      // วันที่เหลืออยู่ก่อนจบ nextBillingDate
      const billingStart = dayjs(nextBillingDate).add(1, 'day').toDate();
      const billingEnd = dayjs(billingStart)
        .add(planPrice?.periodCount || 1, 'month')
        .subtract(1, 'day')
        .toDate();
      await this.organizationSubscriptionRepo.update({
        where: { id: sub.id },
        data: {
          nextBillingDate: billingEnd,
          periodCount: { increment: planPrice.periodCount || 0 },
        },
      });
      return await this.packageTransactionRepo.create({
        data: {
          organizationId: sub.organizationId,
          amountPaid: planPrice.price,
          planId: plan.id,
          currency: 'THB',
          status: 'complete',
          paymentMethod: 'upgrade',
          paidAt: new Date(),
          planName: plan?.name || sub.planName,
          planInterval: sub.interval || sub.period || 'monthly',
          billingPeriodStart: billingStart,
          billingPeriodEnd: billingEnd,
        },
      });
    } else {
      //Change Plan
      const now = dayjs();
      //ลูกค้าจ่ายราคาเต็ม
      const price = planPrice.price;

      //หาวันที่ period count ที่เพิ่มขึ้น (นับเกือนปัจจุบัน)
      //Ex upgarde 6 เดือนเป็น  1 ปี ใข้มาเริ่ม 01/01/2026 - 15/3/2026 , 15/3/2026 - 31/3/2026 นับเป็น period  1
      const nextBillingDate = dayjs(sub.nextBillingDate);
      const periodCount = planPrice?.periodCount || 1;
      //วันที่สิ้นสุดการชำระเงิน bill ใหม่
      const newNextBillingDate = dayjs(nextBillingDate)
        .add(periodCount - 1, 'month')
        .toDate();
      //คำนวณ extra credit ที่จะได้เพิ่มใน period ปัจจุบัน
      const planDetails = plan?.detailJson as any;

      // จำนวนวันวันที่เหลืออยู่ก่อนจบ period
      const remainingDays = Math.max(
        0,
        dayjs(sub.currentPeriodEnd).diff(now, 'day'),
      );
      //จำนวนวะนทั้งหมดของเดือน
      const totalDaysOfNewPeriod = Math.max(
        1,
        dayjs(sub.currentPeriodEnd).diff(sub.currentPeriodStart, 'day'),
      );
      // ราคาใหม่ที่ต้องจ่ายเพิ่ม = ราคาเต็ม price / จำนวนวันทั้งหมดของ plan ใหม่ * วันที่เหลือ
      // const extraPrice =
      //   (Number(price || 0) / totalDaysOfNewPlan) * remainingDays;

      // imageAllowne ,creditAllow Pro Rate
      const extraImageAllowance = Math.floor(
        (planDetails?.imageAllowance / totalDaysOfNewPeriod) * remainingDays ||
        0
      );
      const extraCreditAllowance = Math.floor(
        (planDetails?.creditAllowance / totalDaysOfNewPeriod) * remainingDays ||
        0
      );

      const creditBalance = await this.creditBalanceRepo.update({
        where: { organizationId: sub.organizationId },
        data: {
          currentCycleBalance: { increment: extraCreditAllowance },
          currentCycleImage: { increment: extraImageAllowance },
        },
      });
      const transaction = await this.packageTransactionRepo.create({
        data: {
          organizationId: sub.organizationId,
          amountPaid: price,
          planId: plan.id,
          currency: 'THB',
          status: 'complete',
          paymentMethod: 'upgrade',
          paidAt: new Date(),
          planName: plan.name,
          planInterval: planPrice.interval,
          billingPeriodStart: now.toDate(),
          billingPeriodEnd: newNextBillingDate,
        },
      });

      const newsubscription = await this.organizationSubscriptionRepo.update({
        where: { id: sub.id },
        data: {
          periodCount:planPrice.periodCount,
          periodCurrent: 1,
          nextBillingDate: newNextBillingDate,
          nextPlanId: plan.id,
          nextPlanPriceId: priceId,
        },
      });

      return {
        transaction,
        creditBalance,
        newsubscription,
      };
    }
  }
  // cron job
  async changeCycleSubscription() {
    Logger.log('Running subscription renewal check...');
    const now = dayjs();

    // Next Billing Date Now
    try {
      const subscriptions = await this.organizationSubscriptionRepo.findMany({
        where: {
          nextBillingDate: {
            gte: now.startOf('day').toDate(),
            lte: now.endOf('day').toDate(),
          },
        },
      });

      for (const sub of subscriptions) {
        try {
          // check auto renew
          if (!sub.autoRenew) {
            //if auto renew is false, cancel the subscription
            await this.organizationSubscriptionRepo.update({
              where: { id: sub.id },
              data: {
                status: 'canceled',
              },
            });
            await this.creditBalanceRepo.update({
              where: { organizationId: sub.organizationId },
              data: {
                currentCycleBalance: 0,
                currentCycleImage: 0,
              },
            });
            continue;
          }

          //Auto continue sub subscription

          const plan = await this.planRepo.findOne({
            where: { id: sub.nextPlanId },
          });
          const planPrice = await this.planPriceRepo.findOne({
            where: { id: sub.nextPlanPriceId },
          });

          const planDetails = plan.detailJson as any; 
          const periodCount = planPrice.periodCount || 1;
          const startDate = now.add(1, 'day');
          const endDate = dayjs(startDate).add(
            1,
            'month',
          ).subtract(1, 'day');
          const nextBillingDate = dayjs(startDate).add(
            1 * periodCount,
            'month',
          ).subtract(1, 'day');

          const imageAllowance = planDetails?.imageAllowance || 0;
          const creditAllowance = planDetails?.creditAllowance || 0;
          const maxUserAccess = planDetails?.maxUserAccess || 0;

          Logger.log(
            `Activating subscription for org ${sub.organizationId} from transaction ${sub.id}`,
          );
          await this.packageTransactionRepo.create({
            data: {
              organizationId: sub.organizationId,
              planName: plan.name,
              planInterval: planPrice.interval,
              amountPaid: planPrice.price,
              currency: planPrice.currency,
              status: 'complete',
              paymentMethod: 'renewal',
              paidAt: new Date(),
              billingPeriodStart: startDate.toDate(),
              billingPeriodEnd: nextBillingDate.toDate(),
            },
          });
          const newSub = await this.organizationSubscriptionRepo.update({
            where: { id: sub.id },
            data: {
              status: 'active',
              currentPeriodStart: startDate.toDate(),
              currentPeriodEnd: endDate.toDate(),
              nextBillingDate: nextBillingDate.toDate(),
              periodCurrent: 1,
              periodCount: periodCount,
              imageAllowance: imageAllowance,
              creditAllowance: creditAllowance,
              planId: plan.id,
              planName: plan.name,
              price: planPrice.price,
              nextPlanId: plan.id,
              nextPlanPriceId: planPrice.id,
            },
          });

          await this.creditBalanceRepo.update({
            where: { organizationId: newSub.organizationId },
            data: {
              currentCycleBalance: creditAllowance,
              currentCycleImage: imageAllowance,
            },
          });
          await this.organizationRepo.update({
            where: { organizationId: newSub.organizationId },
            data: {
              status: false,
              maxUserAccess: maxUserAccess,
            },
          });
        } catch (error) {
          Logger.error(
            `Error processing pending transaction ${sub.id}: ${error.message}`,
          );
        }
      }
    } catch (error) {
      Logger.error(`Error processing future subscriptions: ${error.message}`);
    }

    try {
      //Check auto add credit new period
      const periodSub = await this.organizationSubscriptionRepo.findMany({
        where: {
          status: 'active',
          currentPeriodEnd: {
            gte: now.startOf('day').toDate(),
            lte: now.endOf('day').toDate(),
          },
          nextBillingDate: {
            not: {
              gte: now.startOf('day').toDate(),
              lte: now.endOf('day').toDate(),
            },
          },
        },
      });

      //reset credit balance new period
      for (const sub of periodSub) {
        try {
          const plan = await this.planRepo.findOne({
            where: { id: sub.planId },
          });
          const planDetails = plan.detailJson as any;
          // หากถึง currentPeriodEnd
          const startDate = dayjs().add(1, 'day').toDate();
          const endDate = dayjs(startDate).add(1, 'month').subtract(1, 'day').toDate();
          await this.creditBalanceRepo.update({
            where: { organizationId: sub.organizationId },
            data: {
              currentCycleBalance: sub.creditAllowance,
              currentCycleImage: sub.imageAllowance,
            },
          });
          await this.organizationSubscriptionRepo.update({
            where: { id: sub.id },
            data: {
              currentPeriodStart: startDate,
              currentPeriodEnd: endDate,
              periodCurrent: { increment: 1 },
            },
          });
        } catch (error) {
          Logger.error(
            `Error processing subscription ${sub.id}: ${error.message}`,
          );
        }
      }
    } catch (error) {
      Logger.error(`Error fetching subscriptions: ${error.message}`);
    }
  }
}
