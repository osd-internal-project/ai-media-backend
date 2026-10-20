import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AuthUser,
  CreditBalanceRepository,
  OrganizationMemberRepository,
  OrganizationRepository,
  OrganizationSubscriptionRepository,
  PackageTransactionRepository,
  PlanPriceRepository,
  PlanRepository,
  PrismaService,
} from '@ai-media/share';
import { OrganizationSubscription, Prisma } from '@prisma/client';
import * as dayjs from 'dayjs';
import configs from '../configs';
import { OmiseService } from '../omise/omise.service';
import { CancelMode } from './dto/admin-subscription.dto';

const SYSTEM_ADMIN_ROLES = ['SUPER_ADMIN', 'SYSTEM_ADMIN'];
const ORGANIZATION_MANAGER_ROLES = ['OWNER', 'ADMIN'];

@Injectable()
export class OrganizationSubscriptionService {
  constructor(
    private readonly organizationSubscriptionRepo: OrganizationSubscriptionRepository,
    private readonly creditBalanceRepo: CreditBalanceRepository,
    private readonly planRepo: PlanRepository,
    private readonly planPriceRepo: PlanPriceRepository,
    private readonly prisma: PrismaService,
    private readonly organizationRepo: OrganizationRepository,
    private readonly packageTransactionRepo: PackageTransactionRepository,
    private readonly omiseService: OmiseService,
    private readonly organizationMemberRepo: OrganizationMemberRepository,
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

  /** Package ที่ปิดไปแล้วเปลี่ยนเข้าไม่ได้ แต่ต่ออายุ package เดิมของ org ได้ */
  private async findTargetPlan(sub: OrganizationSubscription, priceId: string) {
    const planPrice = await this.planPriceRepo.findOne({
      where: { id: priceId },
    });
    if (!planPrice) throw new NotFoundException('Price plan not found');
    const plan = await this.planRepo.findOne({
      where: { id: planPrice.planId },
    });
    if (!plan) throw new NotFoundException('Plan not found');
    if (!plan.status && plan.id !== sub.planId) {
      throw new BadRequestException('Package is inactive');
    }
    return { planPrice, plan };
  }

  async downgradeSubscription(organizationId: string, priceId: string) {
    const sub = await this.organizationSubscriptionRepo.findOne({
      where: { organizationId },
    });
    if (!sub) throw new NotFoundException('Subscription not found');

    const { plan } = await this.findTargetPlan(sub, priceId);
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

    const { planPrice, plan } = await this.findTargetPlan(sub, priceId);
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
  /** ต่อรอบโดยไม่เก็บเงิน (เดิมเป็น branch ของ plan ฟรี) — reset เครดิตตาม allowance + เลื่อนวันของรอบ */
  private async rollCycleWithoutCharge(
    sub: Pick<
      OrganizationSubscription,
      'id' | 'organizationId' | 'periodCount' | 'creditAllowance' | 'imageAllowance'
    >,
    now: dayjs.Dayjs,
  ): Promise<void> {
    const startDate = now.add(1, 'day');
    const endDate = dayjs(startDate).add(1, 'month').subtract(1, 'day');
    const nextBillingDate = dayjs(startDate)
      .add(sub.periodCount || 1, 'month')
      .subtract(1, 'day');
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
        currentPeriodStart: startDate.toDate(),
        currentPeriodEnd: endDate.toDate(),
        nextBillingDate: nextBillingDate.toDate(),
        periodCurrent: 1,
      },
    });
  }

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
          // ยกเลิกแล้ว/หมดอายุไม่ต่อรอบ — ต้องเช็คก่อน plan ฟรี เพราะ plan ฟรีไม่ดู autoRenew
          if (sub.status === 'expired' || sub.status === 'pending_cancel') {
            continue;
          }

          // Free plan (price 0): perpetual, never charged. Roll the cycle forward
          // for free — refresh credits + advance dates — and keep it active.
          if (Number(sub.price) === 0) {
            await this.rollCycleWithoutCharge(sub, now);
            continue;
          }

          // Auto-renew off (paid plan cancelled / lapsing) → do NOT renew here.
          // Cancellation expiry is handled by the pending_cancel branch below at
          // currentPeriodEnd; a bare autoRenew-off paid sub simply won't renew.
          if (!sub.autoRenew) {
            continue;
          }

          // ปิด billing (org ถูกสร้างโดย admin): autoRenew คือ switch ต่อรอบให้เองโดยไม่ตัดเงิน
          if (!configs().billingEnabled) {
            await this.rollCycleWithoutCharge(sub, now);
            Logger.log(
              `Sub ${sub.id} renewed without charge (billing disabled, autoRenew on)`,
            );
            continue;
          }

          //Auto continue sub subscription

          const plan = await this.planRepo.findOne({
            where: { id: sub.nextPlanId },
          });
          const planPrice = await this.planPriceRepo.findOne({
            where: { id: sub.nextPlanPriceId },
          });

          // Execute the actual renewal payment before provisioning. Only orgs
          // with a saved card (Omise customer) can be auto-charged; PromptPay /
          // bank-transfer subs have no card → they must renew manually, so we
          // move them to `past_due` instead of renewing them for free.
          const org = await this.organizationRepo.findOne({
            where: { organizationId: sub.organizationId },
          });
          if (!org?.omiseCustomerId) {
            await this.organizationSubscriptionRepo.update({
              where: { id: sub.id },
              data: { status: 'past_due' },
            });
            Logger.warn(
              `Sub ${sub.id} has no saved card → past_due (manual renewal required)`,
            );
            continue;
          }
          let charge: { id: string; status: string } | null = null;
          try {
            charge = await this.omiseService.chargeCustomerCard({
              amountBaht: Number(planPrice.price),
              customerId: org.omiseCustomerId,
              description: `Auto-renewal ${plan.name}`,
              invoiceNo: `RENEW-${sub.id}-${now.format('YYYYMMDD')}`,
            });
          } catch (err) {
            Logger.error(
              `Auto-renew charge failed for org ${sub.organizationId}: ${err.message}`,
            );
          }
          if (!charge || charge.status !== 'successful') {
            await this.organizationSubscriptionRepo.update({
              where: { id: sub.id },
              data: { status: 'past_due' },
            });
            continue;
          }

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
          // ไม่แตะ Organization.status — สวิตช์ซ่อน org ของ admin แยกจากการต่ออายุ
          await this.organizationRepo.update({
            where: { organizationId: newSub.organizationId },
            data: { maxUserAccess: maxUserAccess },
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

    // Cancellation: subscriptions flagged `pending_cancel` stay active with their
    // credits until the current cycle ends; once currentPeriodEnd has passed,
    // revoke access (status → expired, credits → 0).
    try {
      const cancelling = await this.organizationSubscriptionRepo.findMany({
        where: {
          status: 'pending_cancel',
          currentPeriodEnd: { lte: now.endOf('day').toDate() },
        },
      });
      for (const sub of cancelling) {
        try {
          await this.organizationSubscriptionRepo.update({
            where: { id: sub.id },
            data: { status: 'expired' },
          });
          await this.creditBalanceRepo.update({
            where: { organizationId: sub.organizationId },
            data: { currentCycleBalance: 0, currentCycleImage: 0 },
          });
        } catch (error) {
          Logger.error(
            `Error expiring cancelled subscription ${sub.id}: ${error.message}`,
          );
        }
      }
    } catch (error) {
      Logger.error(`Error processing cancellations: ${error.message}`);
    }
  }

  /**
   * Cancel a subscription (spec workflow 5): keep it active with current credits
   * until the end of the current cycle, then the daily cron expires it. Sets
   * autoRenew off + status `pending_cancel`.
   */
  async cancelSubscription(organizationId: string) {
    const sub = await this.organizationSubscriptionRepo.findOne({
      where: { organizationId },
    });
    if (!sub) throw new NotFoundException('Subscription not found');
    return this.organizationSubscriptionRepo.update({
      where: { id: sub.id },
      data: { autoRenew: false, status: 'pending_cancel' },
    });
  }

  assertSuperAdmin(authUser: AuthUser | undefined) {
    // trim ก่อนเทียบ — ข้อมูล role ในระบบมีค่าที่ติดช่องว่างท้ายอยู่จริง
    const role = authUser?.role?.trim();
    if (!role || !SYSTEM_ADMIN_ROLES.includes(role)) {
      throw new ForbiddenException(
        'Only a system administrator can manage this package',
      );
    }
  }

  /** Super admin หรือ OWNER/ADMIN ของ org นั้น */
  async assertOrganizationManager(
    authUser: AuthUser | undefined,
    organizationId: string,
  ) {
    if (!authUser) throw new ForbiddenException('Missing authenticated user');
    if (SYSTEM_ADMIN_ROLES.includes(authUser.role?.trim() ?? '')) return;
    const member = await this.organizationMemberRepo.findOne({
      where: { organizationId, userId: authUser.userId },
      select: { role: true },
    });
    if (!member || !ORGANIZATION_MANAGER_ROLES.includes(member.role)) {
      throw new ForbiddenException(
        'Only an organization owner or admin can manage this package',
      );
    }
  }

  /** ต่อ 1 รอบของ package เดิม — ถ้าหมดอายุ/ค้างจ่าย เริ่มรอบใหม่วันนี้พร้อม reset credit */
  async adminRenew(organizationId: string) {
    const sub = await this.findSubscriptionOrThrow(organizationId);
    const months = await this.renewalMonths(sub);
    const lapsed = sub.status === 'expired' || sub.status === 'past_due';
    const start = lapsed ? dayjs() : dayjs(sub.nextBillingDate).add(1, 'day');
    const nextBillingDate = start
      .add(months, 'month')
      .subtract(1, 'day')
      .toDate();

    return this.prisma.$transaction(async (tx) => {
      if (lapsed) {
        await tx.creditBalance.update({
          where: { organizationId },
          data: {
            currentCycleBalance: sub.creditAllowance,
            currentCycleImage: sub.imageAllowance,
          },
        });
      }
      const subscription = await tx.organizationSubscription.update({
        where: { id: sub.id },
        data: {
          status: 'active',
          autoRenew: true,
          nextBillingDate,
          ...(lapsed && {
            currentPeriodStart: start.toDate(),
            currentPeriodEnd: start.add(1, 'month').subtract(1, 'day').toDate(),
            periodCurrent: 1,
          }),
        },
      });
      await tx.packageTransaction.create({
        data: {
          organizationId,
          amountPaid: 0,
          planId: sub.planId,
          currency: 'THB',
          status: 'complete',
          paymentMethod: 'admin_renewal',
          paidAt: new Date(),
          planName: sub.planName,
          planInterval: sub.interval || sub.period || 'monthly',
          billingPeriodStart: start.toDate(),
          billingPeriodEnd: nextBillingDate,
        },
      });
      Logger.log(
        `Admin renewed sub ${sub.id} org=${organizationId} lapsed=${lapsed} nextBillingDate=${nextBillingDate.toISOString()}`,
      );
      return subscription;
    });
  }

  /** เปลี่ยน package ทันที: plan/allowance/seat ใหม่ + reset credit รอบปัจจุบัน วันของรอบคงเดิม */
  async adminChangePackage(organizationId: string, priceId: string) {
    const sub = await this.findSubscriptionOrThrow(organizationId);
    if (sub.status === 'expired') {
      throw new BadRequestException(
        'Subscription has expired — renew it before changing the package',
      );
    }
    const { planPrice, plan } = await this.findTargetPlan(sub, priceId);
    const { creditAllowance, imageAllowance, maxUserAccess } =
      this.planAllowances(plan.detailJson);

    return this.prisma.$transaction(async (tx) => {
      const subscription = await tx.organizationSubscription.update({
        where: { id: sub.id },
        data: {
          planId: plan.id,
          planName: plan.name,
          price: planPrice.price,
          interval: planPrice.interval,
          creditAllowance,
          imageAllowance,
          periodCount: planPrice.periodCount || 1,
          nextPlanId: plan.id,
          nextPlanPriceId: planPrice.id,
        },
      });
      await tx.creditBalance.update({
        where: { organizationId },
        data: {
          currentCycleBalance: creditAllowance,
          currentCycleImage: imageAllowance,
        },
      });
      await tx.organization.update({
        where: { organizationId },
        data: { maxUserAccess },
      });
      await tx.packageTransaction.create({
        data: {
          organizationId,
          amountPaid: 0,
          planId: plan.id,
          currency: 'THB',
          status: 'complete',
          paymentMethod: 'admin_change',
          paidAt: new Date(),
          planName: plan.name,
          planInterval: planPrice.interval,
          billingPeriodStart: new Date(),
          billingPeriodEnd: sub.nextBillingDate,
        },
      });
      Logger.log(
        `Admin changed package sub ${sub.id} org=${organizationId} ${sub.planId} -> ${plan.id} price=${planPrice.id}`,
      );
      return subscription;
    });
  }

  async adminCancel(organizationId: string, mode: CancelMode) {
    const sub = await this.findSubscriptionOrThrow(organizationId);
    if (sub.status === 'expired') {
      throw new BadRequestException('Subscription has already expired');
    }
    if (mode === 'end_of_period') {
      return this.cancelSubscription(organizationId);
    }
    // ยกเลิกทันที: credit ของรอบเป็น 0 แต่ on-top ที่ซื้อแยกยังอยู่ (เหมือน cron ตอนหมดอายุ)
    return this.prisma.$transaction(async (tx) => {
      await tx.creditBalance.update({
        where: { organizationId },
        data: { currentCycleBalance: 0, currentCycleImage: 0 },
      });
      const subscription = await tx.organizationSubscription.update({
        where: { id: sub.id },
        data: { status: 'expired', autoRenew: false },
      });
      Logger.log(`Admin cancelled sub ${sub.id} org=${organizationId} immediately`);
      return subscription;
    });
  }

  async adminResume(organizationId: string) {
    const sub = await this.findSubscriptionOrThrow(organizationId);
    if (sub.status !== 'pending_cancel') {
      throw new BadRequestException(
        'Only a subscription pending cancellation can be resumed',
      );
    }
    return this.organizationSubscriptionRepo.update({
      where: { id: sub.id },
      data: { status: 'active', autoRenew: true },
    });
  }

  private async findSubscriptionOrThrow(organizationId: string) {
    const sub = await this.organizationSubscriptionRepo.findOne({
      where: { organizationId },
    });
    if (!sub) throw new NotFoundException('Subscription not found');
    return sub;
  }

  /** ความยาว 1 รอบ = periodCount ของ price ปัจจุบัน (nextPlanPriceId ใช้ได้เมื่อยังเป็น plan เดิม) */
  private async renewalMonths(sub: OrganizationSubscription) {
    const price = sub.nextPlanPriceId
      ? await this.planPriceRepo.findOne({ where: { id: sub.nextPlanPriceId } })
      : null;
    if (price && price.planId === sub.planId && price.periodCount > 0) {
      return price.periodCount;
    }
    return sub.periodCount || 1;
  }

  /** อ่าน allowance แบบเดียวกับ createBySystemAdmin (Plan.detailJson) */
  private planAllowances(detailJson: Prisma.JsonValue) {
    // detailJson เป็น Json อิสระจากหน้า plan-management — แปลงทีละ field
    const details = (detailJson ?? {}) as Record<string, unknown>;
    return {
      creditAllowance: Number(details.creditAllowance) || 0,
      imageAllowance: Number(details.imageAllowance) || 0,
      maxUserAccess: Number(details.maxUserAccess) || 0,
    };
  }
}
