import { PrismaService } from '../modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { TQueryClient } from '../modules/prisma/types';
import { Prisma } from '@prisma/client';

@Injectable()
export class OrganizationMemberRepository {
  constructor(private prisma: PrismaService) {}
  async findAll(
    condition: Prisma.OrganizationMemberFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.organizationMember.findMany(condition);
  }
  async findMany(
    condition: Prisma.OrganizationMemberFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.organizationMember.findMany(condition);
  }
  async findOne(
    condition: Prisma.OrganizationMemberFindFirstArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.organizationMember.findFirst(condition);
  }
  async create(
    condition: Prisma.OrganizationMemberCreateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.organizationMember.create(condition);
  }
  async createMany(
    data: Prisma.OrganizationMemberCreateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.organizationMember.createMany(data);
  }
  async update(
    data: Prisma.OrganizationMemberUpdateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.organizationMember.update(data);
  }
  async updatemany(
    data: Prisma.OrganizationMemberUpdateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.organizationMember.updateMany(data);
  }
  async delete(
    condition: Prisma.OrganizationMemberDeleteArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.organizationMember.delete(condition);
  }
  async deleteMany(
    condition: Prisma.OrganizationMemberDeleteManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.organizationMember.deleteMany(condition);
  }

  async count(
    condition: Prisma.OrganizationMemberCountArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.organizationMember.count(condition);
  }
}
