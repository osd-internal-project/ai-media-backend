import { PrismaService } from '../modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { TQueryClient } from '../modules/prisma/types';
import { Prisma } from '@prisma/client';

@Injectable()
export class ErrorLogRepository {
  constructor(private prisma: PrismaService) {}

  async findAll(
    condition: Prisma.ErrorLogFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.errorLog.findMany(condition);
  }

  async findMany(
    condition: Prisma.ErrorLogFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.errorLog.findMany(condition);
  }

  async findOne(
    condition: Prisma.ErrorLogFindFirstArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.errorLog.findFirst(condition);
  }

  async create(
    condition: Prisma.ErrorLogCreateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.errorLog.create(condition);
  }

  async createMany(
    data: Prisma.ErrorLogCreateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.errorLog.createMany(data);
  }

  async update(
    data: Prisma.ErrorLogUpdateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.errorLog.update(data);
  }

  async delete(
    condition: Prisma.ErrorLogDeleteArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.errorLog.delete(condition);
  }

  async deleteMany(
    condition: Prisma.ErrorLogDeleteManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.errorLog.deleteMany(condition);
  }

  async count(
    condition: Prisma.ErrorLogCountArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.errorLog.count(condition);
  }
}
