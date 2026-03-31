import { PrismaService } from '../modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { TQueryClient } from '../modules/prisma/types';
import { Prisma } from '@prisma/client';

@Injectable()
export class CouponCodeRepository {
  constructor(private prisma: PrismaService) {}
  async findAll(
    condition: Prisma.CouponCodeFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.couponCode.findMany(condition);
  }
  async findMany(
    condition: Prisma.CouponCodeFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.couponCode.findMany(condition);
  }
  async findOne(
    condition: Prisma.CouponCodeFindFirstArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.couponCode.findFirst(condition);
  }
  async create(
    condition: Prisma.CouponCodeCreateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.couponCode.create(condition);
  }
  async createMany(
    data: Prisma.CouponCodeCreateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.couponCode.createMany(data);
  }
  async update(
    data: Prisma.CouponCodeUpdateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.couponCode.update(data);
  }
  async updateMany(
    data: Prisma.CouponCodeUpdateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.couponCode.updateMany(data);
  }
  async delete(
    condition: Prisma.CouponCodeDeleteArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.couponCode.delete(condition);
  }
  async deleteMany(
    condition: Prisma.CouponCodeDeleteManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.couponCode.deleteMany(condition);
  }

  async count(
    condition: Prisma.CouponCodeCountArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.couponCode.count(condition);
  }
}
