import { PrismaService } from '../modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { TQueryClient } from '../modules/prisma/types';
import { Prisma } from '@prisma/client';

@Injectable()
export class BrandKitDetailRepository {
  constructor(private prisma: PrismaService) {}

  async findAll(
    condition: Prisma.BrandKitDetailFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.brandKitDetail.findMany(condition);
  }

  async findMany(
    condition: Prisma.BrandKitDetailFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.brandKitDetail.findMany(condition);
  }

  async findOne(
    condition: Prisma.BrandKitDetailFindFirstArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.brandKitDetail.findFirst(condition);
  }

  async create(
    condition: Prisma.BrandKitDetailCreateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.brandKitDetail.create(condition);
  }

  async createMany(
    data: Prisma.BrandKitDetailCreateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.brandKitDetail.createMany(data);
  }

  async update(
    data: Prisma.BrandKitDetailUpdateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.brandKitDetail.update(data);
  }

  async delete(
    condition: Prisma.BrandKitDetailDeleteArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.brandKitDetail.delete(condition);
  }

  async updateMany(
    data: Prisma.BrandKitDetailUpdateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.brandKitDetail.updateMany(data);
  }

  async deleteMany(
    condition: Prisma.BrandKitDetailDeleteManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.brandKitDetail.deleteMany(condition);
  }

  async count(
    condition: Prisma.BrandKitDetailCountArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.brandKitDetail.count(condition);
  }
}
