import { PrismaService } from '../modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { TQueryClient } from '../modules/prisma/types';
import { Prisma } from '@prisma/client';

@Injectable()
export class MasterdataModelTypeRepository {
  constructor(private prisma: PrismaService) {}
  async findAll(
    condition: Prisma.MasterModelTypeFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.masterModelType.findMany(condition);
  }
  async findMany(
    condition: Prisma.MasterModelTypeFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.masterModelType.findMany(condition);
  }
  async findOne(
    condition: Prisma.MasterModelTypeFindFirstArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.masterModelType.findFirst(condition);
  }
  async create(
    condition: Prisma.MasterModelTypeCreateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.masterModelType.create(condition);
  }
  async createMany(
    data: Prisma.MasterModelTypeCreateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.masterModelType.createMany(data);
  }
  async update(
    data: Prisma.MasterModelTypeUpdateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.masterModelType.update(data);
  }
  async delete(
    condition: Prisma.MasterModelTypeDeleteArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.masterModelType.delete(condition);
  }
  async deleteMany(
    condition: Prisma.MasterModelTypeDeleteManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.masterModelType.deleteMany(condition);
  }

  async count(
    condition: Prisma.MasterModelTypeCountArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.masterModelType.count(condition);
  }
}
