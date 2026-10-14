import { PrismaService } from '../modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { TQueryClient } from '../modules/prisma/types';
import { Prisma } from '@prisma/client';

@Injectable()
export class PendingPurchaseRepository {
  constructor(private prisma: PrismaService) {}

  async findMany(
    condition: Prisma.PendingPurchaseFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.pendingPurchase.findMany(condition);
  }

  async findOne(
    condition: Prisma.PendingPurchaseFindFirstArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.pendingPurchase.findFirst(condition);
  }

  async findUnique(
    condition: Prisma.PendingPurchaseFindUniqueArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.pendingPurchase.findUnique(condition);
  }

  async create(
    condition: Prisma.PendingPurchaseCreateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.pendingPurchase.create(condition);
  }

  async update(
    data: Prisma.PendingPurchaseUpdateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.pendingPurchase.update(data);
  }

  async count(
    condition: Prisma.PendingPurchaseCountArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.pendingPurchase.count(condition);
  }
}
