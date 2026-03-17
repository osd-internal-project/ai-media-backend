import { PrismaService } from '../modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { TQueryClient } from '../modules/prisma/types';
import { Prisma } from '@prisma/client';

@Injectable()
export class BrandKitDetailTypeRepository {
  constructor(private prisma: PrismaService) {}

  async findAll(
    condition: Prisma.BrandKitDetailTypeFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.brandKitDetailType.findMany(condition);
  }

  async findMany(
    condition: Prisma.BrandKitDetailTypeFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.brandKitDetailType.findMany(condition);
  }

  async findOne(
    condition: Prisma.BrandKitDetailTypeFindFirstArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.brandKitDetailType.findFirst(condition);
  }

  async create(
    condition: Prisma.BrandKitDetailTypeCreateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.brandKitDetailType.create(condition);
  }

  async createMany(
    data: Prisma.BrandKitDetailTypeCreateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.brandKitDetailType.createMany(data);
  }

  async update(
    data: Prisma.BrandKitDetailTypeUpdateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.brandKitDetailType.update(data);
  }

  async delete(
    condition: Prisma.BrandKitDetailTypeDeleteArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.brandKitDetailType.delete(condition);
  }

  async updateMany(
    data: Prisma.BrandKitDetailTypeUpdateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.brandKitDetailType.updateMany(data);
  }

  async deleteMany(
    condition: Prisma.BrandKitDetailTypeDeleteManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.brandKitDetailType.deleteMany(condition);
  }

  async count(
    condition: Prisma.BrandKitDetailTypeCountArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.brandKitDetailType.count(condition);
  }
}
