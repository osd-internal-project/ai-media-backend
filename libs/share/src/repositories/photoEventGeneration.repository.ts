import { PrismaService } from '../modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { TQueryClient } from '../modules/prisma/types';
import { Prisma } from '@prisma/client';

/**
 * Repository สำหรับตาราง photo_event_generation (งาน generate ของ Photo Event)
 * ห่อ PrismaService ตามแพทเทิร์นเดียวกับ repository อื่นในโปรเจกต์
 */
@Injectable()
export class PhotoEventGenerationRepository {
  constructor(private prisma: PrismaService) {}

  async findMany(
    condition: Prisma.PhotoEventGenerationFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.photoEventGeneration.findMany(condition);
  }

  async findOne(
    condition: Prisma.PhotoEventGenerationFindFirstArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.photoEventGeneration.findFirst(condition);
  }

  async create(
    condition: Prisma.PhotoEventGenerationCreateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.photoEventGeneration.create(condition);
  }

  async update(
    data: Prisma.PhotoEventGenerationUpdateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.photoEventGeneration.update(data);
  }

  async updateMany(
    data: Prisma.PhotoEventGenerationUpdateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.photoEventGeneration.updateMany(data);
  }

  async delete(
    condition: Prisma.PhotoEventGenerationDeleteArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.photoEventGeneration.delete(condition);
  }

  async count(
    condition: Prisma.PhotoEventGenerationCountArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.photoEventGeneration.count(condition);
  }
}
