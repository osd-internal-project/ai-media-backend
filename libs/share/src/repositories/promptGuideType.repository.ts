import { PrismaService } from '../modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { TQueryClient } from '../modules/prisma/types';
import { Prisma } from '@prisma/client';

@Injectable()
export class PromptGuideTypeRepository {
  constructor(private prisma: PrismaService) {}
  async findAll(
    condition: Prisma.PromptGuideTypeFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.promptGuideType.findMany(condition);
  }
  async findMany(
    condition: Prisma.PromptGuideTypeFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.promptGuideType.findMany(condition);
  }
  async findOne(
    condition: Prisma.PromptGuideTypeFindFirstArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.promptGuideType.findFirst(condition);
  }
  async create(
    condition: Prisma.PromptGuideTypeCreateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.promptGuideType.create(condition);
  }
  async createMany(
    data: Prisma.PromptGuideTypeCreateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.promptGuideType.createMany(data);
  }
  async update(
    data: Prisma.PromptGuideTypeUpdateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.promptGuideType.update(data);
  }
  async delete(
    condition: Prisma.PromptGuideTypeDeleteArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.promptGuideType.delete(condition);
  }
  async deleteMany(
    condition: Prisma.PromptGuideTypeDeleteManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.promptGuideType.deleteMany(condition);
  }

  async count(
    condition: Prisma.PromptGuideTypeCountArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.promptGuideType.count(condition);
  }
}
