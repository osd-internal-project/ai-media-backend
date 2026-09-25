import { PrismaService } from '../modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { TQueryClient } from '../modules/prisma/types';
import { Prisma } from '@prisma/client';

@Injectable()
export class PromptGuideImageRepository {
  constructor(private prisma: PrismaService) {}
  async findAll(
    condition: Prisma.PromptGuideImageFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.promptGuideImage.findMany(condition);
  }
  async findMany(
    condition: Prisma.PromptGuideImageFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.promptGuideImage.findMany(condition);
  }
  async findOne(
    condition: Prisma.PromptGuideImageFindFirstArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.promptGuideImage.findFirst(condition);
  }
  async create(
    condition: Prisma.PromptGuideImageCreateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.promptGuideImage.create(condition);
  }
  async createMany(
    data: Prisma.PromptGuideImageCreateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.promptGuideImage.createMany(data);
  }
  async update(
    data: Prisma.PromptGuideImageUpdateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.promptGuideImage.update(data);
  }
  async updateMany(
    data: Prisma.PromptGuideImageUpdateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.promptGuideImage.updateMany(data);
  }
  async delete(
    condition: Prisma.PromptGuideImageDeleteArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.promptGuideImage.delete(condition);
  }
  async deleteMany(
    condition: Prisma.PromptGuideImageDeleteManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.promptGuideImage.deleteMany(condition);
  }

  async count(
    condition: Prisma.PromptGuideImageCountArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.promptGuideImage.count(condition);
  }
}
