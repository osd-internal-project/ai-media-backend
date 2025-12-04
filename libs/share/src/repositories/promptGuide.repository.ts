import { PrismaService } from '../modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { TQueryClient } from '../modules/prisma/types';
import { Prisma } from '@prisma/client';

@Injectable()
export class PromptGuideRepository {
  constructor(private prisma: PrismaService) {}
  async findAll(
    condition: Prisma.PromptGuideFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.promptGuide.findMany(condition);
  }
  async findMany(
    condition: Prisma.PromptGuideFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.promptGuide.findMany(condition);
  }
  async findOne(
    condition: Prisma.PromptGuideFindFirstArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.promptGuide.findFirst(condition);
  }
  async create(
    condition: Prisma.PromptGuideCreateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.promptGuide.create(condition);
  }
  async createMany(
    data: Prisma.PromptGuideCreateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.promptGuide.createMany(data);
  }
  async update(
    data: Prisma.PromptGuideUpdateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.promptGuide.update(data);
  }
  async delete(
    condition: Prisma.PromptGuideDeleteArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.promptGuide.delete(condition);
  }
  async deleteMany(
    condition: Prisma.PromptGuideDeleteManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.promptGuide.deleteMany(condition);
  }

  async count(
    condition: Prisma.PromptGuideCountArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.promptGuide.count(condition);
  }
}
