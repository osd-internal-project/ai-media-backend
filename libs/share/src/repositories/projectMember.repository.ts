import { PrismaService } from '../modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { TQueryClient } from '../modules/prisma/types';
import { Prisma } from '@prisma/client';

@Injectable()
export class ProjectMemberRepository {
  constructor(private prisma: PrismaService) {}
  async findAll(
    condition: Prisma.ProjectMemberFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.projectMember.findMany(condition);
  }
  async findMany(
    condition: Prisma.ProjectMemberFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.projectMember.findMany(condition);
  }
  async findOne(
    condition: Prisma.ProjectMemberFindFirstArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.projectMember.findFirst(condition);
  }
  async create(
    condition: Prisma.ProjectMemberCreateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.projectMember.create(condition);
  }
  async createMany(
    data: Prisma.ProjectMemberCreateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.projectMember.createMany(data);
  }
  async update(
    data: Prisma.ProjectMemberUpdateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.projectMember.update(data);
  }
  async updateMany(
    data: Prisma.ProjectMemberUpdateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.projectMember.updateMany(data);
  }
  async delete(
    condition: Prisma.ProjectMemberDeleteArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.projectMember.delete(condition);
  }
  async deleteMany(
    condition: Prisma.ProjectMemberDeleteManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.projectMember.deleteMany(condition);
  }

  async count(
    condition: Prisma.ProjectMemberCountArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.projectMember.count(condition);
  }
}
