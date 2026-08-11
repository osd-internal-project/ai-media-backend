import { PrismaService } from '../modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { TQueryClient } from '../modules/prisma/types';
import { Prisma } from '@prisma/client';

@Injectable()
export class CommunityPostReactionRepository {
  constructor(private prisma: PrismaService) {}

  async findOne(
    condition: Prisma.CommunityPostReactionFindFirstArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.communityPostReaction.findFirst(condition);
  }

  async create(
    condition: Prisma.CommunityPostReactionCreateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.communityPostReaction.create(condition);
  }

  /**
   * ใช้ตอนกดยกเลิกไลก์ — deleteMany ไม่โยน error เมื่อไม่เจอแถว
   * ทำให้การกดซ้ำเป็น no-op แทนที่จะเป็น 500
   */
  async deleteMany(
    condition: Prisma.CommunityPostReactionDeleteManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.communityPostReaction.deleteMany(condition);
  }

  async count(
    condition: Prisma.CommunityPostReactionCountArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.communityPostReaction.count(condition);
  }
}
