import { PrismaService } from '../modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { TQueryClient } from '../modules/prisma/types';
import { Prisma } from '@prisma/client';

@Injectable()
export class GenerateImageRepository {
  constructor(private prisma: PrismaService) {}
  async findAll(
    condition: Prisma.GenerateImageFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.generateImage.findMany(condition);
  }
  async findMany(
    condition: Prisma.GenerateImageFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.generateImage.findMany(condition);
  }
  async findOne(
    condition: Prisma.GenerateImageFindFirstArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.generateImage.findFirst(condition);
  }
  async create(
    condition: Prisma.GenerateImageCreateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.generateImage.create(condition);
  }
  async createMany(
    data: Prisma.GenerateImageCreateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.generateImage.createMany(data);
  }
  async update(
    data: Prisma.GenerateImageUpdateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.generateImage.update(data);
  }
  async delete(
    condition: Prisma.GenerateImageDeleteArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.generateImage.delete(condition);
  }
  async deleteMany(
    condition: Prisma.GenerateImageDeleteManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.generateImage.deleteMany(condition);
  }

  async count(
    condition: Prisma.GenerateImageCountArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.generateImage.count(condition);
  }
}
