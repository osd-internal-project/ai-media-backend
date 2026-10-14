import { PrismaService } from '../modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { TQueryClient } from '../modules/prisma/types';
import { Prisma } from '@prisma/client';

/**
 * Repository สำหรับตาราง workflow_block
 * ห่อ PrismaService ตามแพทเทิร์นเดียวกับ repository อื่นในโปรเจกต์
 */
@Injectable()
export class WorkflowBlockRepository {
  constructor(private prisma: PrismaService) {}

  async findMany(
    condition: Prisma.WorkflowBlockFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.workflowBlock.findMany(condition);
  }

  async findOne(
    condition: Prisma.WorkflowBlockFindFirstArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.workflowBlock.findFirst(condition);
  }

  async create(
    condition: Prisma.WorkflowBlockCreateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.workflowBlock.create(condition);
  }

  async update(
    data: Prisma.WorkflowBlockUpdateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.workflowBlock.update(data);
  }

  async updateMany(
    data: Prisma.WorkflowBlockUpdateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.workflowBlock.updateMany(data);
  }

  async delete(
    condition: Prisma.WorkflowBlockDeleteArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.workflowBlock.delete(condition);
  }

  async count(
    condition: Prisma.WorkflowBlockCountArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.workflowBlock.count(condition);
  }
}
