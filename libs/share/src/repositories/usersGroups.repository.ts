import { PrismaService } from '../modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { TQueryClient } from '../modules/prisma/types';
import { Prisma } from '@prisma/client';

@Injectable()
export class UserGroupRepository {
  constructor(private prisma: PrismaService) {}
  async findAll(
    condition: Prisma.UserGroupFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.userGroup.findMany(condition);
  }
  async findMany(
    condition: Prisma.UserGroupFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.userGroup.findMany(condition);
  }
  async findOne(
    condition: Prisma.UserGroupFindFirstArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.userGroup.findFirst(condition);
  }
  async create(
    condition: Prisma.UserGroupCreateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.userGroup.create(condition);
  }
  async createMany(
    data: Prisma.UserGroupCreateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.userGroup.createMany(data);
  }
  async update(
    data: Prisma.UserGroupUpdateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.userGroup.update(data);
  }
  async delete(
    condition: Prisma.UserGroupDeleteArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.userGroup.delete(condition);
  }
  async deleteMany(
    condition: Prisma.UserGroupDeleteManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.userGroup.deleteMany(condition);
  }

  async count(
    condition: Prisma.UserGroupCountArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.userGroup.count(condition);
  }
}
