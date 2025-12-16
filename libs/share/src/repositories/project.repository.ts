import { PrismaService } from '../modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { TQueryClient } from '../modules/prisma/types';
import { Prisma } from '@prisma/client';

@Injectable()
export class ProjectRepository {
  constructor(private prisma: PrismaService) {}
  async findAll(
    condition: Prisma.ProjectFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.project.findMany(condition);
  }
  async findMany(
    condition: Prisma.ProjectFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.project.findMany(condition);
  }
  async findOne(
    condition: Prisma.ProjectFindFirstArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.project.findFirst(condition);
  }
  async create(
    condition: Prisma.ProjectCreateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.project.create(condition);
  }
  async createMany(
    data: Prisma.ProjectCreateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.project.createMany(data);
  }
  async update(
    data: Prisma.ProjectUpdateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.project.update(data);
  }
  async delete(
    condition: Prisma.ProjectDeleteArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.project.delete(condition);
  }
  async deleteMany(
    condition: Prisma.ProjectDeleteManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.project.deleteMany(condition);
  }

  async count(
    condition: Prisma.ProjectCountArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.project.count(condition);
  }
}
