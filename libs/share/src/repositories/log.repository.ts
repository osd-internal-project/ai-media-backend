import { PrismaService } from '../modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { TQueryClient } from '../modules/prisma/types';
import { Prisma } from '@prisma/client';

@Injectable()
export class LogRepository {
  constructor(private prisma: PrismaService) { }
  async findAll(
    condition: Prisma.LogFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.log.findMany(condition);
  }
  async findMany(
    condition: Prisma.LogFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.log.findMany(condition);
  }
  async findOne(
    condition: Prisma.LogFindFirstArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.log.findFirst(condition);
  }
  async create(
    condition: Prisma.LogCreateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.log.create(condition);
  }
  async createMany(
    data: Prisma.LogCreateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.log.createMany(data);
  }
  async update(data: Prisma.LogUpdateArgs, option?: { prisma?: TQueryClient }) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.log.update(data);
  }
  async updateMany(data: Prisma.LogUpdateManyArgs, option?: { prisma?: TQueryClient }) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.log.updateMany(data);
  }
  async delete(
    condition: Prisma.LogDeleteArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.log.delete(condition);
  }
  async deleteMany(
    condition: Prisma.LogDeleteManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.log.deleteMany(condition);
  }

  async count(
    condition: Prisma.LogCountArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.log.count(condition);
  }

  async aggregate(
    condition: Prisma.LogAggregateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.log.aggregate(condition);
  }
}
