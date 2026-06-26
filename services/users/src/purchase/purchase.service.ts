import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  PendingPurchaseRepository,
  PlanPriceRepository,
  PlanRepository,
  PrismaService,
  TQueryClient,
} from '@ai-media/share';
import { Prisma } from '@prisma/client';
import * as dayjs from 'dayjs';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import {
  PayPurchaseCardDto,
  PayPurchaseSourceDto,
} from './dto/pay-purchase.dto';
import { DocumentNumberService } from '../document-number/document-number.service';
import { OmiseService } from '../omise/omise.service';

/** Thailand VAT rate (prices are VAT-exclusive). */
const VAT_RATE = 0.07;

/** Minimal shape of an Omise webhook event we handle. */
interface OmiseWebhookEvent {
  key?: string;
  data?: { id?: string; status?: string };
}

/**
 * Drives the payment-first onboarding flow: an order (PendingPurchase) is
 * created before payment, then on a successful charge the organization and all
 * billing artifacts are created atomically. The org exists only after payment.
 */
@Injectable()
export class PurchaseService {
  private readonly logger = new Logger(PurchaseService.name);

  constructor(
    private readonly pendingPurchaseRepo: PendingPurchaseRepository,
    private readonly planRepo: PlanRepository,
    private readonly planPriceRepo: PlanPriceRepository,
    private readonly omiseService: OmiseService,
    private readonly documentNumberService: DocumentNumberService,
    private readonly prisma: PrismaService,
  ) {}

  /** Create a PENDING order carrying org + tax + price snapshot. */
  async create(dto: CreatePurchaseDto) {
    const planPrice = await this.planPriceRepo.findOne({
      where: { id: dto.planPriceId },
    });
    if (!planPrice) throw new NotFoundException('Plan price not found');
    const plan = await this.planRepo.findOne({
      where: { id: planPrice.planId },
    });
    if (!plan) throw new NotFoundException('Plan not found');

    const subTotal = Number(planPrice.price);
    const vatAmount = Number((subTotal * VAT_RATE).toFixed(2));
    const totalAmount = Number((subTotal + vatAmount).toFixed(2));

    const data: Prisma.PendingPurchaseCreateInput = {
      userId: dto.userId,
      planId: plan.id,
      planPriceId: planPrice.id,
      planName: plan.name,
      planInterval: planPrice.interval,
      orgName: dto.org.name,
      orgDescription: dto.org.description ?? null,
      orgType: dto.org.type ?? 'team',
      billingType: dto.billing.type,
      fullName: dto.billing.fullName ?? null,
      nationalId: dto.billing.nationalId ?? null,
      companyName: dto.billing.companyName ?? null,
      taxId: dto.billing.taxId ?? null,
      branchCode: dto.billing.branchCode ?? null,
      branchName: dto.billing.branchName ?? null,
      contactName: dto.billing.contactName ?? null,
      phone: dto.billing.phone ?? null,
      email: dto.billing.email ?? null,
      address: dto.billing.address,
      subTotal,
      vatAmount,
      totalAmount,
      currency: planPrice.currency,
      paymentMethod: dto.paymentMethod ?? 'CARD',
      status: 'PENDING',
      expiredAt: dayjs().add(1, 'day').toDate(),
    };
    return this.pendingPurchaseRepo.create({ data });
  }

  async findOne(id: string) {
    const order = await this.pendingPurchaseRepo.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  /** Pay an order with a tokenized card (synchronous capture). */
  async payCard(id: string, dto: PayPurchaseCardDto) {
    const order = await this.findOne(id);
    if (order.status === 'PAID') {
      return { status: 'PAID', organizationId: order.createdOrganizationId };
    }
    if (order.status !== 'PENDING') {
      throw new BadRequestException(`Order is ${order.status}`);
    }

    const charge = await this.omiseService.createCardCharge({
      amountBaht: Number(order.totalAmount),
      token: dto.token,
      description: `Package ${order.planName}`,
      invoiceNo: order.id,
    });

    await this.pendingPurchaseRepo.update({
      where: { id: order.id },
      data: { omiseChargeId: charge.id, paymentMethod: 'CARD' },
    });

    if (charge.status === 'successful') {
      return this.confirm(order.id, charge.id);
    }

    await this.pendingPurchaseRepo.update({
      where: { id: order.id },
      data: { status: 'FAILED' },
    });
    throw new BadRequestException(
      charge.failure_message ?? 'Payment was declined.',
    );
  }

  /** Pay an order with PromptPay / internet banking (confirmed later by webhook). */
  async paySource(id: string, dto: PayPurchaseSourceDto) {
    const order = await this.findOne(id);
    if (order.status === 'PAID') {
      return {
        status: 'PAID',
        organizationId: order.createdOrganizationId,
      };
    }
    if (order.status !== 'PENDING') {
      throw new BadRequestException(`Order is ${order.status}`);
    }

    let type: string;
    let bank: string | undefined;
    if (dto.method === 'PROMPTPAY') {
      type = 'promptpay';
    } else {
      if (!dto.bank) {
        throw new BadRequestException('bank is required for internet banking');
      }
      bank = dto.bank;
      type = `internet_banking_${dto.bank}`;
    }

    const charge = await this.omiseService.createSourceCharge({
      amountBaht: Number(order.totalAmount),
      type,
      returnUri: dto.returnUri,
      description: `Package ${order.planName}`,
      invoiceNo: order.id,
    });
    const qrImageUri = this.omiseService.getQrImageUri(charge);

    await this.pendingPurchaseRepo.update({
      where: { id: order.id },
      data: {
        omiseChargeId: charge.id,
        omiseSourceId: charge.source?.id ?? null,
        authorizeUri: charge.authorize_uri ?? null,
        qrImageUri,
        bank: bank?.toUpperCase() ?? null,
        paymentMethod: dto.method,
      },
    });

    return {
      status: charge.status,
      chargeId: charge.id,
      authorizeUri: charge.authorize_uri ?? null,
      qrImageUri,
    };
  }

  /** Polling endpoint; reconciles with Omise and confirms when successful. */
  async getStatus(id: string) {
    const order = await this.findOne(id);
    if (order.status === 'PAID') {
      return { status: 'PAID', organizationId: order.createdOrganizationId };
    }
    if (order.status === 'PENDING' && order.omiseChargeId) {
      const charge = await this.omiseService.retrieveCharge(order.omiseChargeId);
      if (charge.status === 'successful' && charge.paid) {
        return this.confirm(order.id, charge.id);
      }
      if (charge.status === 'failed' || charge.status === 'expired') {
        await this.pendingPurchaseRepo.update({
          where: { id: order.id },
          data: { status: 'FAILED' },
        });
        return { status: 'FAILED' };
      }
    }
    return { status: order.status };
  }

  /** Handle Omise webhooks for purchase charges. Idempotent; no-op if not ours. */
  async handleWebhook(event: OmiseWebhookEvent) {
    const key = event?.key;
    const chargeId = event?.data?.id;
    if (!chargeId || (key !== 'charge.complete' && key !== 'charge.failed')) {
      return { received: true };
    }
    const order = await this.pendingPurchaseRepo.findOne({
      where: { omiseChargeId: chargeId },
    });
    if (!order) return { received: true };

    const charge = await this.omiseService.retrieveCharge(chargeId);
    if (charge.status === 'successful' && charge.paid) {
      await this.confirm(order.id, chargeId);
    } else if (charge.status === 'failed' || charge.status === 'expired') {
      await this.pendingPurchaseRepo.update({
        where: { id: order.id },
        data: { status: 'FAILED' },
      });
    }
    return { received: true };
  }

  /**
   * Atomically create the Organization + full billing on payment success.
   * Idempotent: returns the existing org if the order is already PAID.
   * Mirrors organization.service.createBySystemAdmin + invoice confirm logic.
   */
  async confirm(id: string, chargeId?: string) {
    return this.prisma.$transaction(async (tx) => {
      const txClient = tx as unknown as TQueryClient;
      const order = await tx.pendingPurchase.findUnique({ where: { id } });
      if (!order) throw new NotFoundException('Order not found');
      if (order.status === 'PAID') {
        return {
          status: 'PAID',
          organizationId: order.createdOrganizationId,
          invoiceId: order.invoiceId,
        };
      }

      const plan = await tx.plan.findUnique({ where: { id: order.planId } });
      const price = await tx.planPrice.findUnique({
        where: { id: order.planPriceId },
      });
      if (!plan || !price) throw new NotFoundException('Plan/price not found');

      const planDetails = (plan.detailJson as Record<string, number>) ?? {};
      const imageAllowance =
        price.imageAllowance || planDetails.imageAllowance || 0;
      const creditAllowance =
        price.creditAllowance || planDetails.creditAllowance || 0;
      const maxUserAccess = planDetails.maxUserAccess || 0;
      const periodCount = price.periodCount || 1;
      const unit = price.interval === 'YEAR' ? 'year' : 'month';

      const startDate = new Date();
      const endDate = dayjs(startDate).add(1, unit).subtract(1, 'day').toDate();
      const billingDate = dayjs(startDate)
        .add(periodCount, unit)
        .subtract(1, 'day')
        .toDate();

      // 1. organization + owner member
      const organization = await tx.organization.create({
        data: {
          name: order.orgName,
          description: order.orgDescription,
          type: order.orgType,
          createdById: order.userId,
          slug: order.orgName.toLowerCase().replace(/ /g, '-') + '-team',
          status: true,
          maxUserAccess,
          accessCodes: plan.accessCodes || [],
        },
      });
      await tx.organizationMember.create({
        data: {
          organizationId: organization.organizationId,
          userId: order.userId,
          role: 'OWNER',
          maxImages: 0,
          maxToken: 0,
        },
      });

      // 2. billing profile for the new org (from the order snapshot)
      const billingProfile = await tx.billingProfile.create({
        data: {
          userId: order.userId,
          organizationId: organization.organizationId,
          type: order.billingType,
          address: order.address,
          isDefault: true,
          fullName: order.fullName,
          nationalId: order.nationalId,
          companyName: order.companyName,
          taxId: order.taxId,
          branchCode: order.branchCode,
          branchName: order.branchName,
          contactName: order.contactName,
          phone: order.phone,
          email: order.email,
        },
      });

      // 3. reuse-or-create customer (customerCode generated only here)
      let customer = null as Awaited<
        ReturnType<typeof tx.customer.findFirst>
      > | null;
      if (order.billingType === 'JURISTIC' && order.taxId) {
        customer = await tx.customer.findFirst({
          where: { taxId: order.taxId, branchCode: order.branchCode },
        });
      }
      if (!customer) {
        const customerCode =
          await this.documentNumberService.nextCustomerCode(txClient);
        customer = await tx.customer.create({
          data: {
            customerCode,
            type: order.billingType,
            organizationId: organization.organizationId,
            name:
              order.billingType === 'JURISTIC'
                ? order.companyName ?? order.fullName ?? ''
                : order.fullName ?? order.companyName ?? '',
            taxId: order.taxId,
            branchCode: order.branchCode,
            branchName: order.branchName,
            address: order.address,
          },
        });
      }

      // 4. invoice (PAID) + receipt
      const invoiceNo = await this.documentNumberService.nextInvoiceNo(txClient);
      const invoice = await tx.invoice.create({
        data: {
          invoiceNo,
          organizationId: organization.organizationId,
          userId: order.userId,
          billingProfileId: billingProfile.id,
          customerId: customer.id,
          planId: plan.id,
          planPriceId: price.id,
          planName: plan.name,
          planInterval: price.interval,
          subTotal: order.subTotal,
          vatAmount: order.vatAmount,
          totalAmount: order.totalAmount,
          currency: order.currency,
          status: 'PAID',
          paymentMethod: order.paymentMethod,
          issuedAt: startDate,
          paidAt: startDate,
        },
      });
      const receiptNo = await this.documentNumberService.nextReceiptNo(txClient);
      await tx.receipt.create({
        data: {
          receiptNo,
          invoiceId: invoice.id,
          customerId: customer.id,
          preVatAmount: order.subTotal,
          vatAmount: order.vatAmount,
          amount: order.totalAmount,
          issuedAt: startDate,
        },
      });

      // 5. subscription + credit balance + package transaction
      await tx.packageTransaction.create({
        data: {
          organizationId: organization.organizationId,
          planId: plan.id,
          planName: plan.name,
          planInterval: price.interval,
          amountPaid: order.totalAmount,
          currency: order.currency,
          status: 'complete',
          paymentMethod: order.paymentMethod,
          paidAt: startDate,
          billingPeriodStart: startDate,
          billingPeriodEnd: billingDate,
        },
      });
      await tx.organizationSubscription.create({
        data: {
          organizationId: organization.organizationId,
          planId: plan.id,
          planName: plan.name,
          price: price.price,
          interval: price.interval,
          creditAllowance,
          imageAllowance,
          currentPeriodStart: startDate,
          currentPeriodEnd: endDate,
          nextBillingDate: billingDate,
          status: 'active',
          period: price.interval === 'YEAR' ? 'yearly' : 'monthly',
          periodCount,
          periodCurrent: 1,
          nextPlanId: plan.id,
          nextPlanPriceId: price.id,
          autoRenew: true,
        },
      });
      await tx.creditBalance.create({
        data: {
          organizationId: organization.organizationId,
          currentCycleBalance: creditAllowance,
          currentCycleImage: imageAllowance,
          onTopBalance: 0,
          onTopImage: 0,
          holdBalance: 0,
          holdImage: 0,
        },
      });

      // 6. remember the org for the user
      await tx.users.updateMany({
        where: { userId: order.userId },
        data: { recentOrganizationId: organization.organizationId },
      });

      // 7. close the order
      await tx.pendingPurchase.update({
        where: { id: order.id },
        data: {
          status: 'PAID',
          createdOrganizationId: organization.organizationId,
          invoiceId: invoice.id,
        },
      });

      this.logger.log(
        `Purchase ${order.id} confirmed → org ${organization.organizationId}, invoice ${invoiceNo} (charge ${chargeId ?? 'n/a'})`,
      );
      return {
        status: 'PAID',
        organizationId: organization.organizationId,
        invoiceId: invoice.id,
        invoiceNo,
      };
    });
  }
}
