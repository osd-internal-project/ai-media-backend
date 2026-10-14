import { PrismaService } from '../modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { TQueryClient } from '../modules/prisma/types';
import { Prisma } from '@prisma/client';

@Injectable()
export class WhtRequestStatusLogRepository {
  constructor(private prisma: PrismaService) {}

  async findMany(
    condition: Prisma.WhtRequestStatusLogFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.whtRequestStatusLog.findMany(condition);
  }

  async create(
    condition: Prisma.WhtRequestStatusLogCreateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.whtRequestStatusLog.create(condition);
  }
}
