import { PrismaService } from '../modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { TQueryClient } from '../modules/prisma/types';
import { Prisma } from '@prisma/client';

@Injectable()
export class GroupsRepository {
  constructor(private prisma: PrismaService) {}
  async findAll(
    condition: Prisma.groupsFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.groups.findMany(condition);
  }
  async findMany(
    condition: Prisma.groupsFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.groups.findMany(condition);
  }
  async findOne(
    condition: Prisma.groupsFindFirstArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.groups.findFirst(condition);
  }
  async create(
    condition: Prisma.groupsCreateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.groups.create(condition);
  }
  async createMany(
    data: Prisma.groupsCreateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.groups.createMany(data);
  }
  async update(
    data: Prisma.groupsUpdateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.groups.update(data);
  }
  async delete(
    condition: Prisma.groupsDeleteArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.groups.delete(condition);
  }
  async deleteMany(
    condition: Prisma.groupsDeleteManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.groups.deleteMany(condition);
  }

  async count(
    condition: Prisma.groupsCountArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.groups.count(condition);
  }
}
