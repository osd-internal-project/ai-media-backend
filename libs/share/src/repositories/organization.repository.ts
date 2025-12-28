import { PrismaService } from '../modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { TQueryClient } from '../modules/prisma/types';
import { Prisma } from '@prisma/client';

@Injectable()
export class OrganizationRepository {
  constructor(private prisma: PrismaService) {}
  async findAll(
    condition: Prisma.OrganizationFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.organization.findMany(condition);
  }
  async findMany(
    condition: Prisma.OrganizationFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.organization.findMany(condition);
  }
  async findOne(
    condition: Prisma.OrganizationFindFirstArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.organization.findFirst(condition);
  }
  async create(
    condition: Prisma.OrganizationCreateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.organization.create(condition);
  }
  async createMany(
    data: Prisma.OrganizationCreateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.organization.createMany(data);
  }
  async update(
    data: Prisma.OrganizationUpdateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.organization.update(data);
  }
  async updatemany(
    data: Prisma.OrganizationUpdateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.organization.updateMany(data);
  }
  async delete(
    condition: Prisma.OrganizationDeleteArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.organization.delete(condition);
  }
  async deleteMany(
    condition: Prisma.OrganizationDeleteManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.organization.deleteMany(condition);
  }

  async count(
    condition: Prisma.OrganizationCountArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.organization.count(condition);
  }
}
