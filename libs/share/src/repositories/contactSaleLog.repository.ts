import { PrismaService } from '../modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { TQueryClient } from '../modules/prisma/types';
import { Prisma } from '@prisma/client';

@Injectable()
export class ContactSaleLogRepository {
  constructor(private prisma: PrismaService) {}
  async findAll(
    condition: Prisma.ContactSaleLogFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.contactSaleLog.findMany(condition);
  }
  async findMany(
    condition: Prisma.ContactSaleLogFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.contactSaleLog.findMany(condition);
  }
  async findOne(
    condition: Prisma.ContactSaleLogFindFirstArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.contactSaleLog.findFirst(condition);
  }
  async create(
    condition: Prisma.ContactSaleLogCreateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.contactSaleLog.create(condition);
  }
  async createMany(
    data: Prisma.ContactSaleLogCreateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.contactSaleLog.createMany(data);
  }
  async update(
    data: Prisma.ContactSaleLogUpdateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.contactSaleLog.update(data);
  }
  async updateMany(
    data: Prisma.ContactSaleLogUpdateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.contactSaleLog.updateMany(data);
  }
  async delete(
    condition: Prisma.ContactSaleLogDeleteArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.contactSaleLog.delete(condition);
  }
  async deleteMany(
    condition: Prisma.ContactSaleLogDeleteManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.contactSaleLog.deleteMany(condition);
  }

  async count(
    condition: Prisma.ContactSaleLogCountArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.contactSaleLog.count(condition);
  }
}
