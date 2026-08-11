import { PrismaService } from '../modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { TQueryClient } from '../modules/prisma/types';
import { Prisma } from '@prisma/client';

@Injectable()
export class ActivityShareTargetRepository {
  constructor(private prisma: PrismaService) {}

  async findMany(
    condition: Prisma.ActivityShareTargetFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.activityShareTarget.findMany(condition);
  }

  async findOne(
    condition: Prisma.ActivityShareTargetFindFirstArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.activityShareTarget.findFirst(condition);
  }

  async create(
    condition: Prisma.ActivityShareTargetCreateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.activityShareTarget.create(condition);
  }

  async createMany(
    data: Prisma.ActivityShareTargetCreateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.activityShareTarget.createMany(data);
  }

  async update(
    data: Prisma.ActivityShareTargetUpdateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.activityShareTarget.update(data);
  }

  async updateMany(
    data: Prisma.ActivityShareTargetUpdateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.activityShareTarget.updateMany(data);
  }

  async deleteMany(
    condition: Prisma.ActivityShareTargetDeleteManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.activityShareTarget.deleteMany(condition);
  }

  async count(
    condition: Prisma.ActivityShareTargetCountArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.activityShareTarget.count(condition);
  }
}
