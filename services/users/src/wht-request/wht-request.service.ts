import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InvoiceRepository,
  PrismaService,
  WhtRequestRepository,
  WhtRequestStatusLogRepository,
} from '@ai-media/share';
import { Prisma } from '@prisma/client';
import * as dayjs from 'dayjs';
import { CreateWhtRequestDto } from './dto/create-wht-request.dto';
import {
  UpdateWhtStatusDto,
  WhtStatus,
} from './dto/update-wht-status.dto';

/** Allowed status transitions for a WHT request. */
const WHT_TRANSITIONS: Record<WhtStatus, WhtStatus[]> = {
  PENDING: ['RECEIVED', 'REJECTED'],
  RECEIVED: ['VERIFIED', 'REJECTED'],
  VERIFIED: ['REFUNDED', 'REJECTED'],
  REJECTED: [],
  REFUNDED: [],
};

@Injectable()
export class WhtRequestService {
  constructor(
    private readonly whtRequestRepo: WhtRequestRepository,
    private readonly whtStatusLogRepo: WhtRequestStatusLogRepository,
    private readonly invoiceRepo: InvoiceRepository,
    private readonly prisma: PrismaService,
  ) {}

  /** Paid invoices of JURISTIC customers that have a receipt — eligible for WHT. */
  async eligibleInvoices(organizationId: string) {
    return this.invoiceRepo.findMany({
      where: {
        organizationId,
        status: 'PAID',
        customer: { type: 'JURISTIC' },
        receipt: { isNot: null },
      },
      orderBy: { paidAt: 'desc' },
      include: { customer: true, receipt: true },
    });
  }

  /**
   * Create a WHT refund request for a paid juristic invoice. Locks the receipt
   * snapshot (number/date/pre-VAT) and computes the WHT amount server-side.
   */
  async create(dto: CreateWhtRequestDto) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: dto.invoiceId },
      include: { customer: true, receipt: true },
    });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }
    if (invoice.status !== 'PAID' || !invoice.receipt) {
      throw new BadRequestException('Invoice is not paid / has no receipt');
    }
    if (!invoice.customer || invoice.customer.type !== 'JURISTIC') {
      throw new BadRequestException(
        'WHT requests are available for juristic customers only',
      );
    }

    const preVatAmount = Number(invoice.receipt.preVatAmount);
    const whtAmount = Number(
      ((preVatAmount * dto.whtPercent) / 100).toFixed(2),
    );

    const data: Prisma.WhtRequestCreateInput = {
      invoice: { connect: { id: invoice.id } },
      receiptId: invoice.receipt.id,
      customerId: invoice.customer.id,
      organizationId: invoice.organizationId,
      userId: invoice.userId,
      receiptNo: invoice.receipt.receiptNo,
      receiptDate: invoice.receipt.issuedAt,
      preVatAmount: invoice.receipt.preVatAmount,
      whtPercent: dto.whtPercent,
      whtAmount,
      docRefNo: dto.docRefNo,
      docRefDate: dayjs(dto.docRefDate).toDate(),
      bankAccountName: dto.bankAccountName,
      bankName: dto.bankName,
      bankAccountNumber: dto.bankAccountNumber,
      bankBranchCode: dto.bankBranchCode,
      status: 'PENDING',
    };

    const request = await this.whtRequestRepo.create({ data });
    await this.whtStatusLogRepo.create({
      data: {
        whtRequestId: request.id,
        fromStatus: null,
        toStatus: 'PENDING',
        adminUserId: invoice.userId,
        note: 'Request created',
      },
    });
    return request;
  }

  async findOne(id: string) {
    const request = await this.whtRequestRepo.findUnique({
      where: { id },
      include: {
        invoice: { include: { customer: true } },
        statusLogs: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!request) {
      throw new NotFoundException('WHT request not found');
    }
    return request;
  }

  /** Admin list — bank account fields are columns so they come back inline. */
  async findManyAdmin(query: {
    status?: string;
    search?: string;
    startDate?: string;
    endDate?: string;
    skip?: string;
    take?: string;
  }) {
    const where: Prisma.WhtRequestWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.search && {
        receiptNo: { contains: query.search, mode: 'insensitive' },
      }),
      ...((query.startDate || query.endDate) && {
        createdAt: {
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
      this.whtRequestRepo.findMany({
        where,
        skip: query.skip ? +query.skip : undefined,
        take: query.take ? +query.take : undefined,
        orderBy: { createdAt: 'desc' },
        include: { invoice: { include: { customer: true } } },
      }),
      this.whtRequestRepo.count({ where }),
    ]);
    return { data, total };
  }

  /** Transition status with validation + audit log (admin user id + timestamp). */
  async updateStatus(id: string, dto: UpdateWhtStatusDto) {
    const request = await this.whtRequestRepo.findUnique({ where: { id } });
    if (!request) {
      throw new NotFoundException('WHT request not found');
    }
    const from = request.status as WhtStatus;
    if (!WHT_TRANSITIONS[from]?.includes(dto.toStatus)) {
      throw new BadRequestException(
        `Cannot change status from ${from} to ${dto.toStatus}`,
      );
    }

    const updated = await this.whtRequestRepo.update({
      where: { id },
      data: { status: dto.toStatus },
    });
    await this.whtStatusLogRepo.create({
      data: {
        whtRequestId: id,
        fromStatus: from,
        toStatus: dto.toStatus,
        adminUserId: dto.adminUserId,
        note: dto.note ?? null,
      },
    });
    return updated;
  }
}
