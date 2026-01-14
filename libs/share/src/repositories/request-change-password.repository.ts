import { PrismaService } from '../modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { TQueryClient } from '../modules/prisma/types';
import { Prisma } from '@prisma/client';

@Injectable()
export class RequestChangePasswordRepository {
  constructor(private prisma: PrismaService) {}
  async findAll(
    condition: Prisma.RequestChangePasswordFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.requestChangePassword.findMany(condition);
  }
  async findMany(
    condition: Prisma.RequestChangePasswordFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.requestChangePassword.findMany(condition);
  }
  async findOne(
    condition: Prisma.RequestChangePasswordFindFirstArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.requestChangePassword.findFirst(condition);
  }
  async create(
    condition: Prisma.RequestChangePasswordCreateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.requestChangePassword.create(condition);
  }
  async createMany(
    data: Prisma.RequestChangePasswordCreateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.requestChangePassword.createMany(data);
  }
  async update(
    data: Prisma.RequestChangePasswordUpdateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.requestChangePassword.update(data);
  }
  async updatemany(
    data: Prisma.RequestChangePasswordUpdateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.requestChangePassword.updateMany(data);
  }
  async delete(
    condition: Prisma.RequestChangePasswordDeleteArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.requestChangePassword.delete(condition);
  }
  async deleteMany(
    condition: Prisma.RequestChangePasswordDeleteManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.requestChangePassword.deleteMany(condition);
  }

  async count(
    condition: Prisma.RequestChangePasswordCountArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.requestChangePassword.count(condition);
  }
}
