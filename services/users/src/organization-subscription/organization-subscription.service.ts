import { Injectable, NotFoundException } from '@nestjs/common';
import {
  OrganizationSubscriptionRepository,
  PackageTransactionRepository,
  PlanRepository,
  PrismaService,
} from '@ai-media/share';
import * as dayjs from 'dayjs';

@Injectable()
export class OrganizationSubscriptionService {
  constructor(
    private readonly organizationSubscriptionRepo: OrganizationSubscriptionRepository,
    private readonly packageTransactionRepo: PackageTransactionRepository,
    private readonly planRepo: PlanRepository,
    private readonly prisma: PrismaService,
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

  async renewSubscription(organizationId: string) {
    const sub = await this.organizationSubscriptionRepo.findOne({
      where: { organizationId },
    });
    if (!sub) throw new NotFoundException('Subscription not found');

    const plan = await this.planRepo.findOne({
      where: { id: sub.planId },
    });

    // nextBillingDate + 1 day
    const billingStart = dayjs(sub.nextBillingDate).add(1, 'day').toDate();

    // plan length
    const planDetails = plan?.detailJson as any;
    const duration = +(planDetails?.duration || 1);
    const durationUnit = planDetails?.unit || 'month';
    const periodCount = sub.periodCount || 1;
    const billingEnd = dayjs(billingStart)
      .add(duration * periodCount, durationUnit as dayjs.ManipulateType)
      .toDate();

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
}
