import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../modules/prisma/prisma.service';
import { TQueryClient } from '../modules/prisma/types';

@Injectable()
export class PlanPriceRepository {
  constructor(private prisma: PrismaService) {}

  async findAll(
    condition: Prisma.PlanPriceFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.planPrice.findMany(condition);
  }

  async findMany(
    condition: Prisma.PlanPriceFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.planPrice.findMany(condition);
  }

  async findOne(
    condition: Prisma.PlanPriceFindFirstArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.planPrice.findFirst(condition);
  }

  async findById(
    id: string,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.planPrice.findUnique({
      where: { id },
    });
  }

  async create(
    data: Prisma.PlanPriceCreateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.planPrice.create(data);
  }

  async createMany(
    data: Prisma.PlanPriceCreateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.planPrice.createMany(data);
  }

  async update(
    data: Prisma.PlanPriceUpdateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.planPrice.update(data);
  }

  async updateMany(
    data: Prisma.PlanPriceUpdateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.planPrice.updateMany(data);
  }

  async delete(
    condition: Prisma.PlanPriceDeleteArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.planPrice.delete(condition);
  }

  async deleteMany(
    condition: Prisma.PlanPriceDeleteManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.planPrice.deleteMany(condition);
  }

  async count(
    condition: Prisma.PlanPriceCountArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.planPrice.count(condition);
  }

  async aggregate(
    condition: Prisma.PlanPriceAggregateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.planPrice.aggregate(condition);
  }
}
