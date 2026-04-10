import { PrismaService } from '../modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { TQueryClient } from '../modules/prisma/types';
import { Prisma } from '@prisma/client';

@Injectable()
export class OrganizationSubscriptionRepository {
  constructor(private prisma: PrismaService) {}

  async findAll(
    condition: Prisma.OrganizationSubscriptionFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.organizationSubscription.findMany(condition);
  }

  async findMany(
    condition: Prisma.OrganizationSubscriptionFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.organizationSubscription.findMany(condition);
  }

  async findOne(
    condition: Prisma.OrganizationSubscriptionFindFirstArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.organizationSubscription.findFirst(condition);
  }

  async findUnique(
    condition: Prisma.OrganizationSubscriptionFindUniqueArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.organizationSubscription.findUnique(condition);
  }

  async create(
    condition: Prisma.OrganizationSubscriptionCreateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.organizationSubscription.create(condition);
  }

  async createMany(
    data: Prisma.OrganizationSubscriptionCreateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.organizationSubscription.createMany(data);
  }

  async update(
    data: Prisma.OrganizationSubscriptionUpdateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.organizationSubscription.update(data);
  }

  async updateMany(
    data: Prisma.OrganizationSubscriptionUpdateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.organizationSubscription.updateMany(data);
  }

  async delete(
    condition: Prisma.OrganizationSubscriptionDeleteArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.organizationSubscription.delete(condition);
  }

  async deleteMany(
    condition: Prisma.OrganizationSubscriptionDeleteManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.organizationSubscription.deleteMany(condition);
  }

  async count(
    condition: Prisma.OrganizationSubscriptionCountArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.organizationSubscription.count(condition);
  }
}
