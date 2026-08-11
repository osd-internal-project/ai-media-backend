import { PrismaService } from '../modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { TQueryClient } from '../modules/prisma/types';
import { Prisma } from '@prisma/client';

@Injectable()
export class SocialAccountRepository {
  constructor(private prisma: PrismaService) {}

  async findMany(
    condition: Prisma.SocialAccountFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.socialAccount.findMany(condition);
  }

  async findOne(
    condition: Prisma.SocialAccountFindFirstArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.socialAccount.findFirst(condition);
  }

  async findUnique(
    condition: Prisma.SocialAccountFindUniqueArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.socialAccount.findUnique(condition);
  }

  async create(
    condition: Prisma.SocialAccountCreateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.socialAccount.create(condition);
  }

  async upsert(
    condition: Prisma.SocialAccountUpsertArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.socialAccount.upsert(condition);
  }

  async update(
    data: Prisma.SocialAccountUpdateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.socialAccount.update(data);
  }

  async updateMany(
    data: Prisma.SocialAccountUpdateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.socialAccount.updateMany(data);
  }

  async delete(
    condition: Prisma.SocialAccountDeleteArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.socialAccount.delete(condition);
  }

  async count(
    condition: Prisma.SocialAccountCountArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.socialAccount.count(condition);
  }
}
