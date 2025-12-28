import { PrismaService } from '../modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { TQueryClient } from '../modules/prisma/types';
import { Prisma } from '@prisma/client';

@Injectable()
export class OmnihumenTaskRepository {
  constructor(private prisma: PrismaService) {}
  async findAll(
    condition: Prisma.OmnihumenTaskFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.omnihumenTask.findMany(condition);
  }
  async findMany(
    condition: Prisma.OmnihumenTaskFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.omnihumenTask.findMany(condition);
  }
  async findOne(
    condition: Prisma.OmnihumenTaskFindFirstArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.omnihumenTask.findFirst(condition);
  }
  async create(
    condition: Prisma.OmnihumenTaskCreateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.omnihumenTask.create(condition);
  }
  async createMany(
    data: Prisma.OmnihumenTaskCreateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.omnihumenTask.createMany(data);
  }
  async update(
    data: Prisma.OmnihumenTaskUpdateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.omnihumenTask.update(data);
  }
  async delete(
    condition: Prisma.OmnihumenTaskDeleteArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.omnihumenTask.delete(condition);
  }
  async deleteMany(
    condition: Prisma.OmnihumenTaskDeleteManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.omnihumenTask.deleteMany(condition);
  }

  async count(
    condition: Prisma.OmnihumenTaskCountArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.omnihumenTask.count(condition);
  }
}
