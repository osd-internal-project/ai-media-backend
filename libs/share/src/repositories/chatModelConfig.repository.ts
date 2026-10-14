import { PrismaService } from '../modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { TQueryClient } from '../modules/prisma/types';
import { Prisma } from '@prisma/client';

@Injectable()
export class ChatModelConfigRepository {
  constructor(private prisma: PrismaService) {}

  async findMany(
    condition: Prisma.ChatModelConfigFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.chatModelConfig.findMany(condition);
  }

  async findOne(
    condition: Prisma.ChatModelConfigFindFirstArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.chatModelConfig.findFirst(condition);
  }

  async findUnique(
    condition: Prisma.ChatModelConfigFindUniqueArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.chatModelConfig.findUnique(condition);
  }

  async create(
    condition: Prisma.ChatModelConfigCreateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.chatModelConfig.create(condition);
  }

  async update(
    data: Prisma.ChatModelConfigUpdateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.chatModelConfig.update(data);
  }

  async delete(
    condition: Prisma.ChatModelConfigDeleteArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.chatModelConfig.delete(condition);
  }

  async count(
    condition: Prisma.ChatModelConfigCountArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.chatModelConfig.count(condition);
  }
}
