import { PrismaService } from '../modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { TQueryClient } from '../modules/prisma/types';
import { Prisma } from '@prisma/client';

@Injectable()
export class DocumentCounterRepository {
  constructor(private prisma: PrismaService) {}

  async findOne(
    condition: Prisma.DocumentCounterFindFirstArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.documentCounter.findFirst(condition);
  }

  async upsert(
    condition: Prisma.DocumentCounterUpsertArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.documentCounter.upsert(condition);
  }
}
