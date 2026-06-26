import { Injectable } from '@nestjs/common';
import { DocumentCounterRepository } from '@ai-media/share';
import { TQueryClient } from '@ai-media/share';
import * as dayjs from 'dayjs';

/** Document types that have running numbers. */
export type DocumentType = 'INV' | 'RTI' | 'CUSTOMER';

/**
 * Generates gap-tolerant, race-safe sequential document numbers backed by the
 * DocumentCounter table. Always run inside the same interactive transaction
 * (pass `tx`) as the rest of the confirmation so the increment is atomic.
 */
@Injectable()
export class DocumentNumberService {
  constructor(
    private readonly documentCounterRepo: DocumentCounterRepository,
  ) {}

  /** Increment the (docType, period) counter and return its new value. */
  private async nextValue(
    docType: DocumentType,
    period: string,
    tx: TQueryClient,
  ): Promise<number> {
    const counter = await this.documentCounterRepo.upsert(
      {
        where: { docType_period: { docType, period } },
        create: { docType, period, lastValue: 1 },
        update: { lastValue: { increment: 1 } },
      },
      { prisma: tx },
    );
    return counter.lastValue;
  }

  /** INV-YYYYMM000001 — period-scoped to the current year+month. */
  async nextInvoiceNo(tx: TQueryClient, now: Date = new Date()): Promise<string> {
    const period = dayjs(now).format('YYYYMM');
    const value = await this.nextValue('INV', period, tx);
    return `INV-${period}${String(value).padStart(6, '0')}`;
  }

  /** RTI-YYYYMM000001 — period-scoped to the current year+month. */
  async nextReceiptNo(tx: TQueryClient, now: Date = new Date()): Promise<string> {
    const period = dayjs(now).format('YYYYMM');
    const value = await this.nextValue('RTI', period, tx);
    return `RTI-${period}${String(value).padStart(6, '0')}`;
  }

  /** C-000001 — a single global running number across all customers. */
  async nextCustomerCode(tx: TQueryClient): Promise<string> {
    const value = await this.nextValue('CUSTOMER', 'GLOBAL', tx);
    return `C-${String(value).padStart(6, '0')}`;
  }
}
