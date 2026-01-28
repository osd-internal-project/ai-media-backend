import { PrismaService } from '../modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { TQueryClient } from '../modules/prisma/types';
import { Prisma } from '@prisma/client';

@Injectable()
export class RefImageRepository {
  constructor(private prisma: PrismaService) { }
  async findAll(
    condition: Prisma.RefImageFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.refImage.findMany(condition);
  }
  async findMany(
    condition: Prisma.RefImageFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.refImage.findMany(condition);
  }
  async findOne(
    condition: Prisma.RefImageFindFirstArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.refImage.findFirst(condition);
  }
  async create(
    condition: Prisma.RefImageCreateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.refImage.create(condition);
  }
  async createMany(
    data: Prisma.RefImageCreateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.refImage.createMany(data);
  }
  async update(
    data: Prisma.RefImageUpdateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.refImage.update(data);
  }
  async updateMany(
    data: Prisma.RefImageUpdateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.refImage.updateMany(data);
  }
  async delete(
    condition: Prisma.RefImageDeleteArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.refImage.delete(condition);
  }
  async deleteMany(
    condition: Prisma.RefImageDeleteManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.refImage.deleteMany(condition);
  }

  async count(
    condition: Prisma.RefImageCountArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.refImage.count(condition);
  }
}
