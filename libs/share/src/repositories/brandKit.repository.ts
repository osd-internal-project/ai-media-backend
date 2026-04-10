import { PrismaService } from '../modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { TQueryClient } from '../modules/prisma/types';
import { Prisma } from '@prisma/client';

@Injectable()
export class BrandKitRepository {
  constructor(private prisma: PrismaService) {}

  async findAll(
    condition: Prisma.BrandKitFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.brandKit.findMany(condition);
  }

  async findMany(
    condition: Prisma.BrandKitFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.brandKit.findMany(condition);
  }

  async findOne(
    condition: Prisma.BrandKitFindFirstArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.brandKit.findFirst(condition);
  }

  async create(
    condition: Prisma.BrandKitCreateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.brandKit.create(condition);
  }

  async createMany(
    data: Prisma.BrandKitCreateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.brandKit.createMany(data);
  }

  async update(
    data: Prisma.BrandKitUpdateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.brandKit.update(data);
  }

  async delete(
    condition: Prisma.BrandKitDeleteArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.brandKit.delete(condition);
  }

  async updateMany(
    data: Prisma.BrandKitUpdateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.brandKit.updateMany(data);
  }

  async deleteMany(
    condition: Prisma.BrandKitDeleteManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.brandKit.deleteMany(condition);
  }

  async count(
    condition: Prisma.BrandKitCountArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.brandKit.count(condition);
  }
}
