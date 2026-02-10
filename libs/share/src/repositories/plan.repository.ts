import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../modules/prisma/prisma.service';
import { TQueryClient } from '../modules/prisma/types';

@Injectable()
export class PlanRepository {
  constructor(private prisma: PrismaService) {}

  async findAll(
    condition: Prisma.PlanFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.plan.findMany(condition);
  }

  async findMany(
    condition: Prisma.PlanFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.plan.findMany(condition);
  }

  async findOne(
    condition: Prisma.PlanFindFirstArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.plan.findFirst(condition);
  }

  async findById(
    id: string,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.plan.findUnique({
      where: { id },
    });
  }

  async create(
    data: Prisma.PlanCreateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.plan.create(data);
  }

  async createMany(
    data: Prisma.PlanCreateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.plan.createMany(data);
  }

  async update(
    data: Prisma.PlanUpdateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.plan.update(data);
  }

  async updateMany(
    data: Prisma.PlanUpdateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.plan.updateMany(data);
  }

  async delete(
    condition: Prisma.PlanDeleteArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.plan.delete(condition);
  }

  async deleteMany(
    condition: Prisma.PlanDeleteManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.plan.deleteMany(condition);
  }

  async count(
    condition: Prisma.PlanCountArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.plan.count(condition);
  }

  async aggregate(
    condition: Prisma.PlanAggregateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.plan.aggregate(condition);
  }
}
