import { PrismaService } from '../modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { TQueryClient } from '../modules/prisma/types';
import { Prisma } from '@prisma/client';

@Injectable()
export class RolesRepository {
  constructor(private prisma: PrismaService) {}
  async findAll(
    condition: Prisma.roleFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.role.findMany(condition);
  }
  async findMany(
    condition: Prisma.roleFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.role.findMany(condition);
  }
  async findOne(
    condition: Prisma.roleFindFirstArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.role.findFirst(condition);
  }
  async create(
    condition: Prisma.roleCreateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.role.create(condition);
  }
  async createMany(
    data: Prisma.roleCreateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.role.createMany(data);
  }
  async update(
    data: Prisma.roleUpdateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.role.update(data);
  }
  async delete(
    condition: Prisma.roleDeleteArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.role.delete(condition);
  }
  async deleteMany(
    condition: Prisma.roleDeleteManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.role.deleteMany(condition);
  }

  async count(
    condition: Prisma.roleCountArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.role.count(condition);
  }
}
