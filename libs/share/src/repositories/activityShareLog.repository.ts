import { PrismaService } from '../modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { TQueryClient } from '../modules/prisma/types';
import { Prisma } from '@prisma/client';

/**
 * ตารางนี้เป็น append-only — จงใจไม่มี update/delete
 * ถ้าต้องแก้ประวัติ ให้เขียน log ใบใหม่แทน
 */
@Injectable()
export class ActivityShareLogRepository {
  constructor(private prisma: PrismaService) {}

  async findMany(
    condition: Prisma.ActivityShareLogFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.activityShareLog.findMany(condition);
  }

  async create(
    condition: Prisma.ActivityShareLogCreateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.activityShareLog.create(condition);
  }

  async createMany(
    data: Prisma.ActivityShareLogCreateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.activityShareLog.createMany(data);
  }

  async count(
    condition: Prisma.ActivityShareLogCountArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.activityShareLog.count(condition);
  }
}
