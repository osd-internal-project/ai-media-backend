import { PrismaService } from '../modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { TQueryClient } from '../modules/prisma/types';
import { Prisma } from '@prisma/client';

@Injectable()
export class BillingProfileRepository {
  constructor(private prisma: PrismaService) {}

  async findMany(
    condition: Prisma.BillingProfileFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.billingProfile.findMany(condition);
  }

  async findOne(
    condition: Prisma.BillingProfileFindFirstArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.billingProfile.findFirst(condition);
  }

  async findUnique(
    condition: Prisma.BillingProfileFindUniqueArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.billingProfile.findUnique(condition);
  }

  async create(
    condition: Prisma.BillingProfileCreateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.billingProfile.create(condition);
  }

  async update(
    data: Prisma.BillingProfileUpdateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.billingProfile.update(data);
  }

  async updateMany(
    data: Prisma.BillingProfileUpdateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.billingProfile.updateMany(data);
  }

  async delete(
    condition: Prisma.BillingProfileDeleteArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.billingProfile.delete(condition);
  }

  async count(
    condition: Prisma.BillingProfileCountArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.billingProfile.count(condition);
  }
}
