import { PrismaService } from '../modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { TQueryClient } from '../modules/prisma/types';
import { Prisma } from '@prisma/client';

/**
 * Repository สำหรับตาราง community_publication (ผลงานที่ส่งไป Community)
 * ห่อ PrismaService ตามแพทเทิร์นเดียวกับ repository อื่นในโปรเจกต์
 */
@Injectable()
export class CommunityPublicationRepository {
  constructor(private prisma: PrismaService) {}

  async findMany(
    condition: Prisma.CommunityPublicationFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.communityPublication.findMany(condition);
  }

  async findOne(
    condition: Prisma.CommunityPublicationFindFirstArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.communityPublication.findFirst(condition);
  }

  async create(
    condition: Prisma.CommunityPublicationCreateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.communityPublication.create(condition);
  }

  async update(
    data: Prisma.CommunityPublicationUpdateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.communityPublication.update(data);
  }

  async updateMany(
    data: Prisma.CommunityPublicationUpdateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.communityPublication.updateMany(data);
  }

  async delete(
    condition: Prisma.CommunityPublicationDeleteArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.communityPublication.delete(condition);
  }
}
