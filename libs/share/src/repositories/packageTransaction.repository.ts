import { PrismaService } from '../modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { TQueryClient } from '../modules/prisma/types';
import { Prisma } from '@prisma/client';

@Injectable()
export class PackageTransactionRepository {
  constructor(private prisma: PrismaService) {}

  async findAll(
    condition: Prisma.PackageTransactionFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.packageTransaction.findMany(condition);
  }

  async findMany(
    condition: Prisma.PackageTransactionFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.packageTransaction.findMany(condition);
  }

  async findOne(
    condition: Prisma.PackageTransactionFindFirstArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.packageTransaction.findFirst(condition);
  }

  async findUnique(
    condition: Prisma.PackageTransactionFindUniqueArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.packageTransaction.findUnique(condition);
  }

  async create(
    condition: Prisma.PackageTransactionCreateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.packageTransaction.create(condition);
  }

  async createMany(
    data: Prisma.PackageTransactionCreateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.packageTransaction.createMany(data);
  }

  async update(
    data: Prisma.PackageTransactionUpdateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.packageTransaction.update(data);
  }

  async updateMany(
    data: Prisma.PackageTransactionUpdateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.packageTransaction.updateMany(data);
  }

  async delete(
    condition: Prisma.PackageTransactionDeleteArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.packageTransaction.delete(condition);
  }

  async deleteMany(
    condition: Prisma.PackageTransactionDeleteManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.packageTransaction.deleteMany(condition);
  }

  async count(
    condition: Prisma.PackageTransactionCountArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.packageTransaction.count(condition);
  }
}
