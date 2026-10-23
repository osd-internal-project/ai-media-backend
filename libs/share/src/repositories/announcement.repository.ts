import { PrismaService } from '../modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { TQueryClient } from '../modules/prisma/types';
import { Prisma } from '@prisma/client';

/**
 * Repository สำหรับตาราง announcement (ประกาศบนหน้า public)
 * ห่อ PrismaService ตามแพทเทิร์นเดียวกับ repository อื่นในโปรเจกต์
 */
@Injectable()
export class AnnouncementRepository {
  constructor(private prisma: PrismaService) {}

  async findMany(
    condition: Prisma.AnnouncementFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.announcement.findMany(condition);
  }

  async findOne(
    condition: Prisma.AnnouncementFindFirstArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.announcement.findFirst(condition);
  }

  async create(
    condition: Prisma.AnnouncementCreateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.announcement.create(condition);
  }

  async update(
    data: Prisma.AnnouncementUpdateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.announcement.update(data);
  }

  async updateMany(
    data: Prisma.AnnouncementUpdateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.announcement.updateMany(data);
  }

  async delete(
    condition: Prisma.AnnouncementDeleteArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.announcement.delete(condition);
  }
}
