import { PrismaService } from '../modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { TQueryClient } from '../modules/prisma/types';
import { Prisma } from '@prisma/client';

@Injectable()
export class InvoiceRepository {
  constructor(private prisma: PrismaService) {}

  async findMany(
    condition: Prisma.InvoiceFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.invoice.findMany(condition);
  }

  async findOne(
    condition: Prisma.InvoiceFindFirstArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.invoice.findFirst(condition);
  }

  async findUnique(
    condition: Prisma.InvoiceFindUniqueArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.invoice.findUnique(condition);
  }

  async create(
    condition: Prisma.InvoiceCreateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.invoice.create(condition);
  }

  async update(
    data: Prisma.InvoiceUpdateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.invoice.update(data);
  }

  async updateMany(
    data: Prisma.InvoiceUpdateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.invoice.updateMany(data);
  }

  async delete(
    condition: Prisma.InvoiceDeleteArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.invoice.delete(condition);
  }

  async count(
    condition: Prisma.InvoiceCountArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.invoice.count(condition);
  }
}
