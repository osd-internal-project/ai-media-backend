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
import { Prisma, Invoice } from '@prisma/client';
import * as dayjs from 'dayjs';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { PayCardDto, PaySourceDto } from './dto/pay-invoice.dto';
import { DocumentNumberService } from '../document-number/document-number.service';
import { OmiseService, OmiseCharge } from '../omise/omise.service';

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

    // UPGRADE charges only the PRORATED DIFFERENCE for the days remaining in the
    // current cycle: (newPrice − oldPrice) × remainingDays / totalDaysOfPeriod.
    // Everything else (CREATE / RENEWAL) charges the full plan price.
    let subTotal = Number(planPrice.price);
    if (
      dto.createNewOrganization !== true &&
      dto.changeType === 'UPGRADE' &&
      dto.organizationId
    ) {
      const sub = await this.prisma.organizationSubscription.findUnique({
        where: { organizationId: dto.organizationId },
      });
      if (sub) {
        const now = dayjs();
        const totalDays = Math.max(
          1,
          dayjs(sub.currentPeriodEnd).diff(sub.currentPeriodStart, 'day'),
        );
        const remainingDays = Math.max(
          0,
          dayjs(sub.currentPeriodEnd).diff(now, 'day'),
        );
        const diff = Math.max(0, Number(planPrice.price) - Number(sub.price));
        subTotal = Number(((diff * remainingDays) / totalDays).toFixed(2));
      }
    }
    const vatAmount = Number((subTotal * VAT_RATE).toFixed(2));
    const totalAmount = Number((subTotal + vatAmount).toFixed(2));
    const amounts = { subTotal, vatAmount, totalAmount };

    // Free plan (isDefault, price 0) creating a new org: a user may hold only one
    // free-plan subscription. The signup personal org has no subscription, so it
    // does not count here.
    if (dto.createNewOrganization === true && plan.isDefault) {
      const existingFree = await this.prisma.organizationSubscription.findFirst({
        where: {
          plan: { isDefault: true },
          organization: { createdById: dto.userId },
        },
      });
      if (existingFree) {
        throw new BadRequestException('You already have a free plan');
      }
    }

    if (dto.createNewOrganization === true) {
      const invoice = await this.createInvoiceForNewOrg(
        dto,
        plan,
        planPrice,
        amounts,
      );
      // Free plan: nothing to charge — confirm now (creates org + subscription)
      // instead of routing through Omise.
      if (Number(invoice.totalAmount) === 0) {
        return this.confirmInvoice(invoice.id);
      }
      return invoice;
    }
    return this.createInvoiceForExistingOrg(dto, plan, planPrice, amounts);
  }

  /**
   * Existing-org invoice: the organization and billing profile must already
   * exist. Fails fast if the organizationId is unknown so a bad id is rejected
   * here instead of deep inside payment confirmation.
   */
  private async createInvoiceForExistingOrg(
    dto: CreateInvoiceDto,
    plan: { id: string; name: string },
    planPrice: { id: string; interval: string; currency: string },
    amounts: { subTotal: number; vatAmount: number; totalAmount: number },
  ) {
    const organization = await this.prisma.organization.findUnique({
      where: { organizationId: dto.organizationId },
    });
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }
    const profile = await this.billingProfileRepo.findUnique({
      where: { id: dto.billingProfileId },
    });
    if (!profile) {
      throw new NotFoundException('Billing profile not found');
    }

    return this.prisma.$transaction(async (tx) => {
      const invoiceNo = await this.documentNumberService.nextInvoiceNo(
        tx as unknown as TQueryClient,
      );
      return tx.invoice.create({
        data: {
          invoiceNo,
          organizationId: dto.organizationId as string,
          userId: dto.userId,
          billingProfileId: dto.billingProfileId as string,
          planId: plan.id,
          planPriceId: planPrice.id,
          planName: plan.name,
          planInterval: planPrice.interval,
          subTotal: amounts.subTotal,
          vatAmount: amounts.vatAmount,
          totalAmount: amounts.totalAmount,
          currency: planPrice.currency,
          status: 'PENDING',
          paymentMethod: dto.paymentMethod,
          issuedAt: new Date(),
          expiredAt: dayjs().add(1, 'day').toDate(),
          changeType: dto.changeType ?? 'RENEWAL',
        },
      });
    });
  }

  /**
   * New-org invoice: the organization does not exist yet. Generate its id now,
   * create the billing profile inline (BillingProfile has no FK to
   * Organization, so this is safe), and stamp the org-form fields onto the
   * invoice. The organization row is created later in confirmInvoice — only
   * after payment succeeds.
   */
  private async createInvoiceForNewOrg(
    dto: CreateInvoiceDto,
    plan: { id: string; name: string },
    planPrice: { id: string; interval: string; currency: string },
    amounts: { subTotal: number; vatAmount: number; totalAmount: number },
  ) {
    const billing = dto.billing;
    if (!billing) {
      throw new BadRequestException(
        'Billing details are required for a new organization',
      );
    }
    // Fail fast if the buyer is not a real user: confirmInvoice will add them as
    // the OWNER member (FK to users.userId), so reject here BEFORE payment is
    // taken rather than after the charge succeeds.
    const user = await this.prisma.users.findUnique({
      where: { userId: dto.userId },
    });
    // console.log('user ',userId)
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // No org id is generated here — the organization (and its id) is created
    // only at payment confirmation. The invoice + billing profile carry a null
    // organizationId until then, so nothing references a non-existent org.
    return this.prisma.$transaction(async (tx) => {
      const billingProfile = await tx.billingProfile.create({
        data: {
          userId: dto.userId,
          organizationId: null,
          type: billing.type,
          address: billing.address,
          isDefault: true,
          fullName: billing.fullName ?? null,
          nationalId: billing.nationalId ?? null,
          companyName: billing.companyName ?? null,
          taxId: billing.taxId ?? null,
          branchCode: billing.branchCode ?? null,
          branchName: billing.branchName ?? null,
          contactName: billing.contactName ?? null,
          phone: billing.phone ?? null,
          email: billing.email ?? null,
        },
      });

      const invoiceNo = await this.documentNumberService.nextInvoiceNo(
        tx as unknown as TQueryClient,
      );
      return tx.invoice.create({
        data: {
          invoiceNo,
          organizationId: null,
          userId: dto.userId,
          billingProfileId: billingProfile.id,
          planId: plan.id,
          planPriceId: planPrice.id,
          planName: plan.name,
          planInterval: planPrice.interval,
          subTotal: amounts.subTotal,
          vatAmount: amounts.vatAmount,
          totalAmount: amounts.totalAmount,
          currency: planPrice.currency,
          status: 'PENDING',
          paymentMethod: dto.paymentMethod,
          issuedAt: new Date(),
          expiredAt: dayjs().add(1, 'day').toDate(),
          isNewOrganization: true,
          orgName: dto.orgName,
          orgType: dto.orgType ?? 'team',
          orgDescription: dto.orgDescription ?? null,
          changeType: 'CREATE',
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

  /**
   * Resolve the right Omise charge for a card payment: a saved card, a new card
   * that we also save (via an Omise customer), or a plain one-time token charge.
   * Saved-card operations require an existing org (new-org invoices carry the
   * created customer id on the invoice until confirm copies it to the org).
   */
  private async chargeCardForInvoice(
    invoice: {
      id: string;
      invoiceNo: string;
      totalAmount: Prisma.Decimal;
      organizationId: string | null;
    },
    dto: PayCardDto,
  ): Promise<OmiseCharge> {
    const base = {
      amountBaht: Number(invoice.totalAmount),
      description: invoice.invoiceNo,
      invoiceNo: invoice.invoiceNo,
    };
    const org = invoice.organizationId
      ? await this.prisma.organization.findUnique({
          where: { organizationId: invoice.organizationId },
        })
      : null;

    // 1) Charge a previously-saved card.
    if (dto.cardId) {
      if (!org?.omiseCustomerId) {
        throw new BadRequestException('No saved cards for this organization');
      }
      return this.omiseService.chargeCustomerCard({
        ...base,
        customerId: org.omiseCustomerId,
        cardId: dto.cardId,
      });
    }

    if (!dto.token) {
      throw new BadRequestException('Card token is required');
    }

    // 2) New card + save it: ensure an Omise customer, then charge it.
    if (dto.saveCard) {
      let customerId = org?.omiseCustomerId ?? undefined;
      let cardId: string | undefined;
      if (customerId) {
        const customer = await this.omiseService.addCard(customerId, dto.token);
        const cards = customer.cards?.data ?? [];
        cardId = customer.default_card ?? cards[cards.length - 1]?.id;
      } else {
        const customer = await this.omiseService.createCustomer({
          cardToken: dto.token,
          description: invoice.organizationId
            ? `org:${invoice.organizationId}`
            : `invoice:${invoice.invoiceNo}`,
        });
        customerId = customer.id;
        cardId = customer.default_card ?? undefined;
      }
      // Persist the customer id: on the org (existing) or on the invoice (new-org
      // → copied onto the org in confirmInvoice).
      if (invoice.organizationId) {
        await this.prisma.organization.update({
          where: { organizationId: invoice.organizationId },
          data: { omiseCustomerId: customerId },
        });
      } else {
        await this.invoiceRepo.update({
          where: { id: invoice.id },
          data: { omiseCustomerId: customerId },
        });
      }
      return this.omiseService.chargeCustomerCard({ ...base, customerId, cardId });
    }

    // 3) One-time token charge (not saved).
    return this.omiseService.createCardCharge({ ...base, token: dto.token });
  }

  /**
   * Pay a PENDING invoice with a card (charge captured immediately). Supports:
   * - a one-time `token` (optionally `saveCard` to store it for the org),
   * - or a previously-saved `cardId` charged against the org's Omise customer.
   */
  async payCard(id: string, dto: PayCardDto) {
    const invoice = await this.findOne(id);
    if (invoice.status === 'PAID') {
      return invoice;
    }
    // FAILED invoices are retryable (a declined charge isn't terminal); only
    // EXPIRED/CANCELLED are blocked. The client submits a fresh single-use token.
    if (invoice.status !== 'PENDING' && invoice.status !== 'FAILED') {
      throw new BadRequestException(`Invoice is ${invoice.status}`);
    }

    const charge = await this.chargeCardForInvoice(invoice, dto);

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
    // FAILED invoices are retryable; only EXPIRED/CANCELLED are blocked.
    if (invoice.status !== 'PENDING' && invoice.status !== 'FAILED') {
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

      // 0. new-org purchase: create the organization now (after payment) before
      //    any FK-bearing writes (package transaction / subscription / member),
      //    then switch the buyer's current org to it. The org id is generated by
      //    the DB here and threaded through the rest of confirmation.
      const organizationId = invoice.isNewOrganization
        ? await this.createOrganizationForInvoice(tx, invoice)
        : invoice.organizationId;
      if (!organizationId) {
        throw new BadRequestException('Invoice has no organization');
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
        const customerCode = await this.documentNumberService.nextCustomerCode(
          txClient,
        );
        customer = await tx.customer.create({
          data: {
            customerCode,
            type: profile.type,
            organizationId,
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
        const receiptNo = await this.documentNumberService.nextReceiptNo(
          txClient,
        );
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
      // UPGRADE = ต่อยอด subscription เดิมแบบ pro-rate (ไม่ reset ทั้งรอบ);
      // CREATE/RENEWAL = activate/ต่ออายุแบบ reset โควตาเต็มรอบ
      if (invoice.changeType === 'UPGRADE') {
        await this.applyUpgrade(tx, {
          organizationId,
          planId: invoice.planId,
          planPriceId: invoice.planPriceId,
          amountPaid: invoice.totalAmount,
          currency: invoice.currency,
        });
      } else {
        await this.activateSubscription(tx, {
          organizationId,
          planId: invoice.planId,
          planPriceId: invoice.planPriceId,
          amountPaid: invoice.totalAmount,
          currency: invoice.currency,
          paymentMethod: invoice.paymentMethod,
        });
      }

      this.logger.log(
        `Invoice ${invoice.invoiceNo} confirmed (charge ${chargeId ?? 'n/a'}, ${
          invoice.changeType ?? 'RENEWAL'
        })`,
      );
      return paidInvoice;
    });
  }

  /**
   * Apply a plan UPGRADE for an existing org after payment — takes effect
   * IMMEDIATELY (spec workflow 4). The invoice already charged the prorated
   * difference (see createInvoice). Here we: switch the subscription to the new
   * plan now (planId/price/allowance snapshot), keep the current cycle dates, and
   * set the credit balance to `(newAllowance − oldAllowance) + remaining` so the
   * org instantly gets the upgraded quota on top of what it had left.
   */
  private async applyUpgrade(
    tx: Prisma.TransactionClient,
    input: {
      organizationId: string;
      planId: string | null;
      planPriceId: string | null;
      amountPaid: Prisma.Decimal;
      currency: string;
    },
  ): Promise<void> {
    if (!input.planId || !input.planPriceId) return;

    const sub = await tx.organizationSubscription.findUnique({
      where: { organizationId: input.organizationId },
    });
    // No existing subscription → fall back to a normal activation.
    if (!sub) {
      await this.activateSubscription(tx, {
        ...input,
        paymentMethod: 'upgrade',
      });
      return;
    }

    const planPrice = await tx.planPrice.findUnique({
      where: { id: input.planPriceId },
    });
    const plan = await tx.plan.findUnique({ where: { id: input.planId } });
    if (!planPrice || !plan) return;

    const planDetails = (plan.detailJson as Record<string, number>) ?? {};
    const periodCount = planPrice.periodCount || 1;
    const now = dayjs();

    const newCreditAllowance =
      planPrice.creditAllowance || planDetails.creditAllowance || 0;
    const newImageAllowance =
      planPrice.imageAllowance || planDetails.imageAllowance || 0;
    const oldCreditAllowance = sub.creditAllowance || 0;
    const oldImageAllowance = sub.imageAllowance || 0;

    // New Credit = (New − Old) + Remaining Active Credits (spec formula).
    const balance = await tx.creditBalance.findUnique({
      where: { organizationId: input.organizationId },
    });
    const remainingCredit = balance?.currentCycleBalance ?? 0;
    const remainingImage = balance?.currentCycleImage ?? 0;
    const newCreditBalance = Math.max(
      0,
      newCreditAllowance - oldCreditAllowance + remainingCredit,
    );
    const newImageBalance = Math.max(
      0,
      newImageAllowance - oldImageAllowance + remainingImage,
    );

    await tx.creditBalance.upsert({
      where: { organizationId: input.organizationId },
      create: {
        organization: { connect: { organizationId: input.organizationId } },
        currentCycleBalance: newCreditBalance,
        currentCycleImage: newImageBalance,
      },
      update: {
        currentCycleBalance: newCreditBalance,
        currentCycleImage: newImageBalance,
      },
    });

    // Record the upgrade transaction (amountPaid = the prorated difference).
    await tx.packageTransaction.create({
      data: {
        organizationId: input.organizationId,
        amountPaid: input.amountPaid,
        planId: plan.id,
        currency: input.currency,
        status: 'complete',
        paymentMethod: 'upgrade',
        paidAt: now.toDate(),
        planName: plan.name,
        planInterval: planPrice.interval,
        billingPeriodStart: now.toDate(),
        billingPeriodEnd: sub.currentPeriodEnd,
      },
    });

    // Switch to the new plan NOW (keep current cycle dates + nextBillingDate;
    // future renewals continue on the new plan via nextPlan*).
    await tx.organizationSubscription.update({
      where: { organizationId: input.organizationId },
      data: {
        plan: { connect: { id: plan.id } },
        planName: plan.name,
        price: planPrice.price,
        interval: planPrice.interval,
        creditAllowance: newCreditAllowance,
        imageAllowance: newImageAllowance,
        periodCount,
        status: 'active',
        nextPlanId: plan.id,
        nextPlanPriceId: planPrice.id,
      },
    });
  }

  /**
   * Create the organization for a new-org package purchase. Called from
   * confirmInvoice after payment succeeds. The org id is generated by the DB
   * (@default(uuid())) — never before this point — then back-filled onto the
   * invoice and billing profile. Also adds the buyer as OWNER and switches the
   * buyer's current org to it. Mirrors the org-creation in purchase.service.ts
   * confirm(). Returns the new organization id.
   */
  private async createOrganizationForInvoice(
    tx: Prisma.TransactionClient,
    invoice: Invoice,
  ): Promise<string> {
    const plan = invoice.planId
      ? await tx.plan.findUnique({ where: { id: invoice.planId } })
      : null;
    const planDetails =
      (plan?.detailJson as Record<string, number> | undefined) ?? {};
    const maxUserAccess = planDetails.maxUserAccess || 0;

    const orgName = invoice.orgName ?? 'My Organization';
    const org = await tx.organization.create({
      data: {
        name: orgName,
        description: invoice.orgDescription,
        type: invoice.orgType ?? 'team',
        createdById: invoice.userId,
        slug: orgName.toLowerCase().replace(/ /g, '-') + '-team',
        status: true,
        maxUserAccess,
        accessCodes: plan?.accessCodes || [],
        // carry over the saved-card customer created during payment (if any)
        omiseCustomerId: invoice.omiseCustomerId,
      },
    });

    // Back-fill the generated org id onto the invoice + its billing profile.
    await tx.invoice.update({
      where: { id: invoice.id },
      data: { organizationId: org.organizationId },
    });
    await tx.billingProfile.update({
      where: { id: invoice.billingProfileId },
      data: { organizationId: org.organizationId },
    });

    await tx.organizationMember.create({
      data: {
        organizationId: org.organizationId,
        userId: invoice.userId,
        role: 'OWNER',
        maxImages: 0,
        maxToken: 0,
      },
    });
    // switch the buyer's current org to the newly created one
    await tx.users.updateMany({
      where: { userId: invoice.userId },
      data: { recentOrganizationId: org.organizationId },
    });

    return org.organizationId;
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

    const existingSub = await tx.organizationSubscription.findUnique({
      where: { organizationId: input.organizationId },
    });

    // Renewal seamlessness: if the org still has an active cycle running (paid
    // early, or before the current cycle ends), append the new cycle right after
    // the current period end so no remaining days are lost. If the cycle has
    // already expired (grace period) — or this is a brand-new org — start today.
    const now = dayjs();
    const stillActive =
      !!existingSub && dayjs(existingSub.currentPeriodEnd).isAfter(now);
    const start = stillActive
      ? dayjs(existingSub!.currentPeriodEnd).add(1, 'day')
      : now;
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
    const subFields = {
      planName: plan.name,
      price: planPrice.price,
      interval: planPrice.interval,
      creditAllowance,
      imageAllowance,
      currentPeriodStart: start.toDate(),
      currentPeriodEnd: periodEnd.toDate(),
      nextBillingDate: periodEnd.toDate(),
      // Free plan (price 0) never auto-renews (nothing to charge).
      autoRenew: Number(planPrice.price) !== 0,
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
          ...(query.startDate && {
            gte: dayjs(query.startDate).startOf('day').toDate(),
          }),
          ...(query.endDate && {
            lte: dayjs(query.endDate).endOf('day').toDate(),
          }),
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
