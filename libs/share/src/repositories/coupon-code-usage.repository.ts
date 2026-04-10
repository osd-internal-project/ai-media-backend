import { PrismaService } from '../modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { TQueryClient } from '../modules/prisma/types';
import { Prisma } from '@prisma/client';

@Injectable()
export class CouponCodeUsageRepository {
  constructor(private prisma: PrismaService) {}
  async findAll(
    condition: Prisma.CouponCodeUsageFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.couponCodeUsage.findMany(condition);
  }
  async findMany(
    condition: Prisma.CouponCodeUsageFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.couponCodeUsage.findMany(condition);
  }
  async findOne(
    condition: Prisma.CouponCodeUsageFindFirstArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.couponCodeUsage.findFirst(condition);
  }
  async create(
    condition: Prisma.CouponCodeUsageCreateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.couponCodeUsage.create(condition);
  }
  async createMany(
    data: Prisma.CouponCodeUsageCreateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.couponCodeUsage.createMany(data);
  }
  async update(
    data: Prisma.CouponCodeUsageUpdateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.couponCodeUsage.update(data);
  }
  async updateMany(
    data: Prisma.CouponCodeUsageUpdateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.couponCodeUsage.updateMany(data);
  }
  async delete(
    condition: Prisma.CouponCodeUsageDeleteArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.couponCodeUsage.delete(condition);
  }
  async deleteMany(
    condition: Prisma.CouponCodeUsageDeleteManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.couponCodeUsage.deleteMany(condition);
  }

  async count(
    condition: Prisma.CouponCodeUsageCountArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.couponCodeUsage.count(condition);
  }
}
