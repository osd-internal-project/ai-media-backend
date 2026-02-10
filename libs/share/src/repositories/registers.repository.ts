import { PrismaService } from '../modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { TQueryClient } from '../modules/prisma/types';
import { Prisma } from '@prisma/client';

@Injectable()
export class RegisterRepository {
  constructor(private prisma: PrismaService) { }
  async findAll(
    condition: Prisma.RegisterFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.register.findMany(condition);
  }
  async findMany(
    condition: Prisma.RegisterFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.register.findMany(condition);
  }
  async findOne(
    condition: Prisma.RegisterFindFirstArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.register.findFirst(condition);
  }
  async create(
    condition: Prisma.RegisterCreateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.register.create(condition);
  }
  async createMany(
    data: Prisma.RegisterCreateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.register.createMany(data);
  }
  async update(
    data: Prisma.RegisterUpdateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.register.update(data);
  }
  async delete(
    condition: Prisma.RegisterDeleteArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.register.delete(condition);
  }
  async deleteMany(
    condition: Prisma.RegisterDeleteManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.register.deleteMany(condition);
  }

  async count(
    condition: Prisma.RegisterCountArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.register.count(condition);
  }
}
