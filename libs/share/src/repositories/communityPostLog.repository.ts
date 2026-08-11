import { PrismaService } from '../modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { TQueryClient } from '../modules/prisma/types';
import { Prisma } from '@prisma/client';

/**
 * community_post_log เป็น append-only — จงใจไม่มี update และ delete
 * (แถวจะหายไปก็ต่อเมื่อโพสต์ต้นทางถูกลบ ผ่าน FK cascade เท่านั้น)
 */
@Injectable()
export class CommunityPostLogRepository {
  constructor(private prisma: PrismaService) {}

  async findMany(
    condition: Prisma.CommunityPostLogFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.communityPostLog.findMany(condition);
  }

  async create(
    condition: Prisma.CommunityPostLogCreateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.communityPostLog.create(condition);
  }

  async count(
    condition: Prisma.CommunityPostLogCountArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.communityPostLog.count(condition);
  }
}
