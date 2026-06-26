import { PrismaService } from '../modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { TQueryClient } from '../modules/prisma/types';
import { Prisma } from '@prisma/client';

@Injectable()
export class CustomerRepository {
  constructor(private prisma: PrismaService) {}

  async findMany(
    condition: Prisma.CustomerFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.customer.findMany(condition);
  }

  async findOne(
    condition: Prisma.CustomerFindFirstArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.customer.findFirst(condition);
  }

  async findUnique(
    condition: Prisma.CustomerFindUniqueArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.customer.findUnique(condition);
  }

  async create(
    condition: Prisma.CustomerCreateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.customer.create(condition);
  }

  async update(
    data: Prisma.CustomerUpdateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.customer.update(data);
  }

  async delete(
    condition: Prisma.CustomerDeleteArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.customer.delete(condition);
  }

  async count(
    condition: Prisma.CustomerCountArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.customer.count(condition);
  }
}
