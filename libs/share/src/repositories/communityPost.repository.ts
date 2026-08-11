import { PrismaService } from '../modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { TQueryClient } from '../modules/prisma/types';
import { Prisma } from '@prisma/client';

@Injectable()
export class CommunityPostRepository {
  constructor(private prisma: PrismaService) {}

  async findMany(
    condition: Prisma.CommunityPostFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.communityPost.findMany(condition);
  }

  async findOne(
    condition: Prisma.CommunityPostFindFirstArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.communityPost.findFirst(condition);
  }

  async findUnique(
    condition: Prisma.CommunityPostFindUniqueArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.communityPost.findUnique(condition);
  }

  async create(
    condition: Prisma.CommunityPostCreateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.communityPost.create(condition);
  }

  async update(
    data: Prisma.CommunityPostUpdateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.communityPost.update(data);
  }

  /**
   * ใช้เป็น optimistic lock ตอนเปลี่ยนสถานะ — ใส่ status เดิมไว้ใน where
   * แล้วเช็ค count === 1 เพื่อกันการกดซ้ำ/แข่งกันสองรีเควสต์
   * และกัน cron หลาย pod หยิบโพสต์ใบเดียวกันไปเผยแพร่พร้อมกัน
   */
  async updateMany(
    data: Prisma.CommunityPostUpdateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.communityPost.updateMany(data);
  }

  async delete(
    condition: Prisma.CommunityPostDeleteArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.communityPost.delete(condition);
  }

  async count(
    condition: Prisma.CommunityPostCountArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.communityPost.count(condition);
  }
}
