import { Injectable, NotFoundException } from '@nestjs/common';
import { CustomerRepository, InvoiceRepository } from '@ai-media/share';
import { Prisma } from '@prisma/client';

@Injectable()
export class CustomerService {
  constructor(
    private readonly customerRepo: CustomerRepository,
    private readonly invoiceRepo: InvoiceRepository,
  ) {}

  /** Search customers by customer code or tax id (admin). */
  async findMany(query: {
    search?: string;
    skip?: string;
    take?: string;
  }) {
    const where: Prisma.CustomerWhereInput = query.search
      ? {
          OR: [
            { customerCode: { contains: query.search, mode: 'insensitive' } },
            { taxId: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {};
    const [data, total] = await Promise.all([
      this.customerRepo.findMany({
        where,
        skip: query.skip ? +query.skip : undefined,
        take: query.take ? +query.take : undefined,
        orderBy: { createdAt: 'desc' },
      }),
      this.customerRepo.count({ where }),
    ]);
    return { data, total };
  }

  async findOne(id: string) {
    const customer = await this.customerRepo.findUnique({ where: { id } });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }
    return customer;
  }

  /** All invoices issued to a customer (drill-in from the customers table). */
  findInvoices(id: string) {
    return this.invoiceRepo.findMany({
      where: { customerId: id },
      orderBy: { issuedAt: 'desc' },
      include: { receipt: true },
    });
  }
}
