import { PrismaService } from '../modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { TQueryClient } from '../modules/prisma/types';
import { Prisma } from '@prisma/client';

@Injectable()
export class ReceiptRepository {
  constructor(private prisma: PrismaService) {}

  async findMany(
    condition: Prisma.ReceiptFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.receipt.findMany(condition);
  }

  async findOne(
    condition: Prisma.ReceiptFindFirstArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.receipt.findFirst(condition);
  }

  async findUnique(
    condition: Prisma.ReceiptFindUniqueArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.receipt.findUnique(condition);
  }

  async create(
    condition: Prisma.ReceiptCreateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.receipt.create(condition);
  }

  async update(
    data: Prisma.ReceiptUpdateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.receipt.update(data);
  }

  async count(
    condition: Prisma.ReceiptCountArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.receipt.count(condition);
  }
}
