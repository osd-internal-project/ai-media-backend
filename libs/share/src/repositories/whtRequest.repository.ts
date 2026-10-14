import { PrismaService } from '../modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { TQueryClient } from '../modules/prisma/types';
import { Prisma } from '@prisma/client';

@Injectable()
export class WhtRequestRepository {
  constructor(private prisma: PrismaService) {}

  async findMany(
    condition: Prisma.WhtRequestFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.whtRequest.findMany(condition);
  }

  async findOne(
    condition: Prisma.WhtRequestFindFirstArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.whtRequest.findFirst(condition);
  }

  async findUnique(
    condition: Prisma.WhtRequestFindUniqueArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.whtRequest.findUnique(condition);
  }

  async create(
    condition: Prisma.WhtRequestCreateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.whtRequest.create(condition);
  }

  async update(
    data: Prisma.WhtRequestUpdateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.whtRequest.update(data);
  }

  async count(
    condition: Prisma.WhtRequestCountArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.whtRequest.count(condition);
  }
}
