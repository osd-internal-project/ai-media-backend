import { PrismaService } from '../modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { TQueryClient } from '../modules/prisma/types';
import { Prisma } from '@prisma/client';

/**
 * Repository สำหรับตาราง integration_api_key (key ของระบบภายนอก)
 * ห่อ PrismaService ตามแพทเทิร์นเดียวกับ repository อื่นในโปรเจกต์
 */
@Injectable()
export class IntegrationApiKeyRepository {
  constructor(private prisma: PrismaService) {}

  async findMany(
    condition: Prisma.IntegrationApiKeyFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.integrationApiKey.findMany(condition);
  }

  async findOne(
    condition: Prisma.IntegrationApiKeyFindFirstArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.integrationApiKey.findFirst(condition);
  }

  async create(
    condition: Prisma.IntegrationApiKeyCreateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.integrationApiKey.create(condition);
  }

  async update(
    data: Prisma.IntegrationApiKeyUpdateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.integrationApiKey.update(data);
  }

  async updateMany(
    data: Prisma.IntegrationApiKeyUpdateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.integrationApiKey.updateMany(data);
  }

  async upsert(
    data: Prisma.IntegrationApiKeyUpsertArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.integrationApiKey.upsert(data);
  }

  async delete(
    condition: Prisma.IntegrationApiKeyDeleteArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.integrationApiKey.delete(condition);
  }
}
