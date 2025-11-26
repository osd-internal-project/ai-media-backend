import { PrismaService } from '../modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { TQueryClient } from '../modules/prisma/types';
import { Prisma } from '@prisma/client';

@Injectable()
export class MasterDataConfigApiRepository {
  constructor(private prisma: PrismaService) {}
  async findAll(
    condition: Prisma.MasterDataConfigApiFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.masterDataConfigApi.findMany(condition);
  }
  async findMany(
    condition: Prisma.MasterDataConfigApiFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.masterDataConfigApi.findMany(condition);
  }
  async findOne(
    condition: Prisma.MasterDataConfigApiFindFirstArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.masterDataConfigApi.findFirst(condition);
  }
  async create(
    condition: Prisma.MasterDataConfigApiCreateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.masterDataConfigApi.create(condition);
  }
  async createMany(
    data: Prisma.MasterDataConfigApiCreateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.masterDataConfigApi.createMany(data);
  }
  async update(
    data: Prisma.MasterDataConfigApiUpdateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.masterDataConfigApi.update(data);
  }
  async delete(
    condition: Prisma.MasterDataConfigApiDeleteArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.masterDataConfigApi.delete(condition);
  }
  async deleteMany(
    condition: Prisma.MasterDataConfigApiDeleteManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.masterDataConfigApi.deleteMany(condition);
  }

  async count(
    condition: Prisma.MasterDataConfigApiCountArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.masterDataConfigApi.count(condition);
  }
}
