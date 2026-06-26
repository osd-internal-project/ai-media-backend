import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  BillingProfileRepository,
  CreditBalanceRepository,
  CustomerRepository,
  InvoiceRepository,
  OrganizationSubscriptionRepository,
  PackageTransactionRepository,
  PaymentRepository,
  PlanPriceRepository,
  PlanRepository,
  PrismaService,
  ReceiptRepository,
  TQueryClient,
} from '@ai-media/share';
import { Prisma } from '@prisma/client';
import * as dayjs from 'dayjs';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { PayCardDto, PaySourceDto } from './dto/pay-invoice.dto';
import { DocumentNumberService } from '../document-number/document-number.service';
import { OmiseService } from '../omise/omise.service';

/** Thailand standard VAT rate applied to package prices (price is VAT-exclusive). */
const VAT_RATE = 0.07;

/** Minimal shape of an Omise webhook event we handle. */
interface OmiseWebhookEvent {
  key?: string; // 'charge.complete' | 'charge.failed'
  data?: { id?: string; status?: string };
}

@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);

  constructor(
    private readonly invoiceRepo: InvoiceRepository,
    private readonly paymentRepo: PaymentRepository,
    private readonly receiptRepo: ReceiptRepository,
    private readonly customerRepo: CustomerRepository,
    private readonly billingProfileRepo: BillingProfileRepository,
    private readonly planRepo: PlanRepository,
    private readonly planPriceRepo: PlanPriceRepository,
    private readonly organizationSubscriptionRepo: OrganizationSubscriptionRepository,
    private readonly creditBalanceRepo: CreditBalanceRepository,
    private readonly packageTransactionRepo: PackageTransactionRepository,
    private readonly documentNumberService: DocumentNumberService,
    private readonly omiseService: OmiseService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Create a PENDING invoice immediately when the user proceeds to pay.
   * Computes subtotal/VAT/total from the selected PlanPrice and assigns an
   * INV-YYYYMM###### number atomically.
   */
  async createInvoice(dto: CreateInvoiceDto) {
    const profile = await this.billingProfileRepo.findUnique({
      where: { id: dto.billingProfileId },
    });
    if (!profile) {
      throw new NotFoundException('Billing profile not found');
    }

    const planPrice = await this.planPriceRepo.findOne({
      where: { id: dto.planPriceId },
    });
    if (!planPrice) {
      throw new NotFoundException('Plan price not found');
    }
    const plan = await this.planRepo.findOne({
      where: { id: planPrice.planId },
    });
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    const subTotal = Number(planPrice.price);
    const vatAmount = Number((subTotal * VAT_RATE).toFixed(2));
    const totalAmount = Number((subTotal + vatAmount).toFixed(2));

    return this.prisma.$transaction(async (tx) => {
      const invoiceNo = await this.documentNumberService.nextInvoiceNo(
        tx as unknown as TQueryClient,
      );
      return tx.invoice.create({
        data: {
          invoiceNo,
          organizationId: dto.organizationId,
          userId: dto.userId,
          billingProfileId: dto.billingProfileId,
          planId: plan.id,
          planPriceId: planPrice.id,
          planName: plan.name,
          planInterval: planPrice.interval,
          subTotal,
          vatAmount,
          totalAmount,
          currency: planPrice.currency,
          status: 'PENDING',
          paymentMethod: dto.paymentMethod,
          issuedAt: new Date(),
          expiredAt: dayjs().add(1, 'day').toDate(),
        },
      });
    });
  }

  /** Fetch an invoice with related customer/receipt/payments or throw. */
  async findOne(id: string) {
    const invoice = await this.invoiceRepo.findUnique({
      where: { id },
      include: { customer: true, receipt: true, payments: true },
    });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }
    return invoice;
  }

  /** Pay a PENDING invoice with a tokenized card (charge captured immediately). */
  async payCard(id: string, dto: PayCardDto) {
    const invoice = await this.findOne(id);
    if (invoice.status === 'PAID') {
      return invoice;
    }
    if (invoice.status !== 'PENDING') {
      throw new BadRequestException(`Invoice is ${invoice.status}`);
    }

    const charge = await this.omiseService.createCardCharge({
      amountBaht: Number(invoice.totalAmount),
      token: dto.token,
      description: invoice.invoiceNo,
      invoiceNo: invoice.invoiceNo,
    });

    await this.paymentRepo.create({
      data: {
        invoiceId: invoice.id,
        method: 'CARD',
        omiseChargeId: charge.id,
        status: charge.status,
        rawPayload: charge as unknown as Prisma.InputJsonValue,
      },
    });

    if (charge.status === 'successful') {
      return this.confirmInvoice(invoice.id, charge.id);
    }

    await this.invoiceRepo.update({
      where: { id: invoice.id },
      data: { status: 'FAILED' },
    });
    throw new BadRequestException(
      charge.failure_message ?? 'Payment was declined.',
    );
  }

  /**
   * Pay a PENDING invoice with PromptPay or internet banking. Creates an Omise
   * source+charge and returns the QR image / authorize uri for the frontend.
   * The invoice stays PENDING until the webhook (or polling) confirms it.
   */
  async paySource(id: string, dto: PaySourceDto) {
    const invoice = await this.findOne(id);
    if (invoice.status === 'PAID') {
      return { status: 'PAID', invoice };
    }
    if (invoice.status !== 'PENDING') {
      throw new BadRequestException(`Invoice is ${invoice.status}`);
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
      amountBaht: Number(invoice.totalAmount),
      type,
      returnUri: dto.returnUri,
      description: invoice.invoiceNo,
      invoiceNo: invoice.invoiceNo,
    });

    const qrImageUri = this.omiseService.getQrImageUri(charge);

    await this.paymentRepo.create({
      data: {
        invoiceId: invoice.id,
        method: dto.method,
        omiseChargeId: charge.id,
        omiseSourceId: charge.source?.id ?? null,
        authorizeUri: charge.authorize_uri ?? null,
        qrImageUri,
        bank: bank?.toUpperCase() ?? null,
        status: charge.status,
        rawPayload: charge as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      status: charge.status,
      chargeId: charge.id,
      authorizeUri: charge.authorize_uri ?? null,
      qrImageUri,
    };
  }

  /**
   * Status endpoint used by PromptPay/banking polling. Reconciles with Omise:
   * if the latest charge is now successful, confirm the invoice on the spot so
   * the flow works even when webhooks are not reachable (e.g. local dev).
   */
  async getStatus(id: string) {
    const invoice = await this.findOne(id);
    if (invoice.status === 'PENDING') {
      const payment = await this.paymentRepo.findOne({
        where: { invoiceId: invoice.id, omiseChargeId: { not: null } },
        orderBy: { createdAt: 'desc' },
      });
      if (payment?.omiseChargeId) {
        const charge = await this.omiseService.retrieveCharge(
          payment.omiseChargeId,
        );
        if (charge.status === 'successful' && charge.paid) {
          const confirmed = await this.confirmInvoice(invoice.id, charge.id);
          return { status: confirmed.status, invoice: confirmed };
        }
        if (charge.status === 'failed' || charge.status === 'expired') {
          await this.invoiceRepo.update({
            where: { id: invoice.id },
            data: { status: 'FAILED' },
          });
          return { status: 'FAILED' };
        }
      }
    }
    return { status: invoice.status, invoice };
  }

  /** Handle Omise webhooks (charge.complete / charge.failed). Idempotent. */
  async handleWebhook(event: OmiseWebhookEvent) {
    const key = event?.key;
    const chargeId = event?.data?.id;
    if (!chargeId || (key !== 'charge.complete' && key !== 'charge.failed')) {
      return { received: true };
    }

    const payment = await this.paymentRepo.findOne({
      where: { omiseChargeId: chargeId },
    });
    if (!payment) {
      this.logger.warn(`Webhook for unknown charge ${chargeId}`);
      return { received: true };
    }

    // Verify against Omise rather than trusting the payload blindly.
    const charge = await this.omiseService.retrieveCharge(chargeId);
    await this.paymentRepo.update({
      where: { id: payment.id },
      data: {
        status: charge.status,
        rawPayload: charge as unknown as Prisma.InputJsonValue,
      },
    });

    if (charge.status === 'successful' && charge.paid) {
      await this.confirmInvoice(payment.invoiceId, chargeId);
    } else if (charge.status === 'failed' || charge.status === 'expired') {
      await this.invoiceRepo.update({
        where: { id: payment.invoiceId },
        data: { status: 'FAILED' },
      });
    }
    return { received: true };
  }

  /**
   * Finalize a paid invoice in a single transaction:
   * 1. mark invoice PAID, 2. reuse-or-create Customer (+ customerCode here only),
   * 3. issue Receipt, 4. record PackageTransaction, 5. activate the
   * OrganizationSubscription and set the cycle credit balances from the plan.
   * Idempotent: returns early if the invoice is already PAID.
   */
  async confirmInvoice(invoiceId: string, chargeId?: string) {
    return this.prisma.$transaction(async (tx) => {
      const txClient = tx as unknown as TQueryClient;

      const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } });
      if (!invoice) {
        throw new NotFoundException('Invoice not found');
      }
      if (invoice.status === 'PAID') {
        return invoice; // already processed — avoid double credit allocation
      }

      const profile = await tx.billingProfile.findUnique({
        where: { id: invoice.billingProfileId },
      });
      if (!profile) {
        throw new NotFoundException('Billing profile not found');
      }

      // 1. reuse-or-create customer (code generated only here)
      let customer = null as Awaited<
        ReturnType<typeof tx.customer.findFirst>
      > | null;
      if (profile.type === 'JURISTIC' && profile.taxId) {
        customer = await tx.customer.findFirst({
          where: { taxId: profile.taxId, branchCode: profile.branchCode },
        });
      }
      if (!customer) {
        const customerCode =
          await this.documentNumberService.nextCustomerCode(txClient);
        customer = await tx.customer.create({
          data: {
            customerCode,
            type: profile.type,
            organizationId: invoice.organizationId,
            name:
              profile.type === 'JURISTIC'
                ? profile.companyName ?? profile.fullName ?? ''
                : profile.fullName ?? profile.companyName ?? '',
            taxId: profile.taxId,
            branchCode: profile.branchCode,
            branchName: profile.branchName,
            address: profile.address,
          },
        });
      }

      // 2. mark invoice paid + link customer
      const paidInvoice = await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          status: 'PAID',
          paidAt: new Date(),
          customerId: customer.id,
        },
      });

      // 3. issue receipt (RTI-######) — one per invoice
      const existingReceipt = await tx.receipt.findUnique({
        where: { invoiceId: invoice.id },
      });
      if (!existingReceipt) {
        const receiptNo =
          await this.documentNumberService.nextReceiptNo(txClient);
        await tx.receipt.create({
          data: {
            receiptNo,
            invoiceId: invoice.id,
            customerId: customer.id,
            preVatAmount: invoice.subTotal,
            vatAmount: invoice.vatAmount,
            amount: invoice.totalAmount,
            issuedAt: new Date(),
          },
        });
      }

      // 4. + 5. allocate credits by activating the subscription
      await this.activateSubscription(tx, {
        organizationId: invoice.organizationId,
        planId: invoice.planId,
        planPriceId: invoice.planPriceId,
        amountPaid: invoice.totalAmount,
        currency: invoice.currency,
        paymentMethod: invoice.paymentMethod,
      });

      this.logger.log(
        `Invoice ${invoice.invoiceNo} confirmed (charge ${chargeId ?? 'n/a'})`,
      );
      return paidInvoice;
    });
  }

  /**
   * Create/update the OrganizationSubscription for the purchased plan and reset
   * the current-cycle credit balances. Mirrors the existing subscription
   * activation in organization-subscription.service.ts.
   */
  private async activateSubscription(
    tx: Prisma.TransactionClient,
    input: {
      organizationId: string;
      planId: string | null;
      planPriceId: string | null;
      amountPaid: Prisma.Decimal;
      currency: string;
      paymentMethod: string;
    },
  ) {
    if (!input.planId || !input.planPriceId) return;

    const planPrice = await tx.planPrice.findUnique({
      where: { id: input.planPriceId },
    });
    const plan = await tx.plan.findUnique({ where: { id: input.planId } });
    if (!planPrice || !plan) return;

    const planDetails = (plan.detailJson as Record<string, number>) ?? {};
    const creditAllowance =
      planPrice.creditAllowance || planDetails.creditAllowance || 0;
    const imageAllowance =
      planPrice.imageAllowance || planDetails.imageAllowance || 0;
    const periodCount = planPrice.periodCount || 1;
    const unit = planPrice.interval === 'YEAR' ? 'year' : 'month';

    const start = dayjs();
    const periodEnd = dayjs(start).add(periodCount, unit).subtract(1, 'day');

    // PackageTransaction record (mirrors existing complete transactions)
    await tx.packageTransaction.create({
      data: {
        organizationId: input.organizationId,
        amountPaid: input.amountPaid,
        planId: plan.id,
        currency: input.currency,
        status: 'complete',
        paymentMethod: input.paymentMethod,
        paidAt: new Date(),
        planName: plan.name,
        planInterval: planPrice.interval,
        billingPeriodStart: start.toDate(),
        billingPeriodEnd: periodEnd.toDate(),
      },
    });

    // Upsert subscription
    const existingSub = await tx.organizationSubscription.findUnique({
      where: { organizationId: input.organizationId },
    });
    const subFields = {
      planName: plan.name,
      price: planPrice.price,
      interval: planPrice.interval,
      creditAllowance,
      imageAllowance,
      currentPeriodStart: start.toDate(),
      currentPeriodEnd: periodEnd.toDate(),
      nextBillingDate: periodEnd.toDate(),
      autoRenew: true,
      status: 'active',
      period: planPrice.interval === 'YEAR' ? 'yearly' : 'monthly',
      periodCount,
      periodCurrent: 1,
      nextPlanId: plan.id,
      nextPlanPriceId: planPrice.id,
    };
    if (existingSub) {
      await tx.organizationSubscription.update({
        where: { organizationId: input.organizationId },
        data: { ...subFields, plan: { connect: { id: plan.id } } },
      });
    } else {
      await tx.organizationSubscription.create({
        data: {
          ...subFields,
          organization: {
            connect: { organizationId: input.organizationId },
          },
          plan: { connect: { id: plan.id } },
        },
      });
    }

    // Reset current-cycle credit balance from the plan allowance
    await tx.creditBalance.upsert({
      where: { organizationId: input.organizationId },
      create: {
        organization: { connect: { organizationId: input.organizationId } },
        currentCycleBalance: creditAllowance,
        currentCycleImage: imageAllowance,
      },
      update: {
        currentCycleBalance: creditAllowance,
        currentCycleImage: imageAllowance,
      },
    });
  }

  /** Admin list with status + date-range filters and pagination. */
  async findManyAdmin(query: {
    status?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
    skip?: string;
    take?: string;
  }) {
    const where: Prisma.InvoiceWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.search && {
        invoiceNo: { contains: query.search, mode: 'insensitive' },
      }),
      ...((query.startDate || query.endDate) && {
        issuedAt: {
          ...(query.startDate && { gte: dayjs(query.startDate).startOf('day').toDate() }),
          ...(query.endDate && { lte: dayjs(query.endDate).endOf('day').toDate() }),
        },
      }),
    };
    const [data, total] = await Promise.all([
      this.invoiceRepo.findMany({
        where,
        skip: query.skip ? +query.skip : undefined,
        take: query.take ? +query.take : undefined,
        orderBy: { issuedAt: 'desc' },
        include: { customer: true, receipt: true },
      }),
      this.invoiceRepo.count({ where }),
    ]);
    return { data, total };
  }

  /** Invoices belonging to an organization (for the user's history). */
  findByOrganizationId(organizationId: string) {
    return this.invoiceRepo.findMany({
      where: { organizationId },
      orderBy: { issuedAt: 'desc' },
      include: { customer: true, receipt: true },
    });
  }
}
