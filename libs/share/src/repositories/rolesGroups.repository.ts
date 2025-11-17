import { PrismaService } from '../modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { TQueryClient } from '../modules/prisma/types';
import { Prisma } from '@prisma/client';

@Injectable()
export class groupsRolesRepository {
  constructor(private prisma: PrismaService) {}
  async findAll(
    condition: Prisma.GroupRoleFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.groupRole.findMany(condition);
  }
  async findMany(
    condition: Prisma.GroupRoleFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.groupRole.findMany(condition);
  }
  async findOne(
    condition: Prisma.GroupRoleFindFirstArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.groupRole.findFirst(condition);
  }
  async create(
    condition: Prisma.GroupRoleCreateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.groupRole.create(condition);
  }
  async createMany(
    data: Prisma.GroupRoleCreateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.groupRole.createMany(data);
  }
  async update(
    data: Prisma.GroupRoleUpdateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.groupRole.update(data);
  }
  async delete(
    condition: Prisma.GroupRoleDeleteArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.groupRole.delete(condition);
  }
  async deleteMany(
    condition: Prisma.GroupRoleDeleteManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.groupRole.deleteMany(condition);
  }

  async count(
    condition: Prisma.GroupRoleCountArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.groupRole.count(condition);
  }
}
