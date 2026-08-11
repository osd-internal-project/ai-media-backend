import { PrismaService } from '../modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { TQueryClient } from '../modules/prisma/types';
import { Prisma } from '@prisma/client';

@Injectable()
export class ActivityShareRepository {
  constructor(private prisma: PrismaService) {}

  async findMany(
    condition: Prisma.ActivityShareFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.activityShare.findMany(condition);
  }

  async findOne(
    condition: Prisma.ActivityShareFindFirstArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.activityShare.findFirst(condition);
  }

  async findUnique(
    condition: Prisma.ActivityShareFindUniqueArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.activityShare.findUnique(condition);
  }

  async create(
    condition: Prisma.ActivityShareCreateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.activityShare.create(condition);
  }

  async update(
    data: Prisma.ActivityShareUpdateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.activityShare.update(data);
  }

  /**
   * ใช้เป็น optimistic lock ตอนเปลี่ยนสถานะ — ใส่ status เดิมไว้ใน where
   * แล้วเช็ค count === 1 เพื่อกันการกดซ้ำ/แข่งกันสองรีเควสต์
   */
  async updateMany(
    data: Prisma.ActivityShareUpdateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.activityShare.updateMany(data);
  }

  async delete(
    condition: Prisma.ActivityShareDeleteArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.activityShare.delete(condition);
  }

  async count(
    condition: Prisma.ActivityShareCountArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.activityShare.count(condition);
  }
}
