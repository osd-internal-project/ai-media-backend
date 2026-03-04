import { PrismaService } from '../modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { TQueryClient } from '../modules/prisma/types';
import { Prisma } from '@prisma/client';

@Injectable()
export class CreditBalanceRepository {
  constructor(private prisma: PrismaService) {}

  async findAll(
    condition: Prisma.CreditBalanceFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.creditBalance.findMany(condition);
  }

  async findMany(
    condition: Prisma.CreditBalanceFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.creditBalance.findMany(condition);
  }

  async findOne(
    condition: Prisma.CreditBalanceFindFirstArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.creditBalance.findFirst(condition);
  }

  async findUnique(
    condition: Prisma.CreditBalanceFindUniqueArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.creditBalance.findUnique(condition);
  }

  async create(
    condition: Prisma.CreditBalanceCreateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.creditBalance.create(condition);
  }

  async createMany(
    data: Prisma.CreditBalanceCreateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.creditBalance.createMany(data);
  }

  async update(
    data: Prisma.CreditBalanceUpdateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.creditBalance.update(data);
  }

  async updateMany(
    data: Prisma.CreditBalanceUpdateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.creditBalance.updateMany(data);
  }

  async delete(
    condition: Prisma.CreditBalanceDeleteArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.creditBalance.delete(condition);
  }

  async deleteMany(
    condition: Prisma.CreditBalanceDeleteManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.creditBalance.deleteMany(condition);
  }

  async count(
    condition: Prisma.CreditBalanceCountArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.creditBalance.count(condition);
  }
}
