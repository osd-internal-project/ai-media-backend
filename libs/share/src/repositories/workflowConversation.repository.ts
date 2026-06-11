import { PrismaService } from '../modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { TQueryClient } from '../modules/prisma/types';
import { Prisma } from '@prisma/client';

/**
 * Repository สำหรับตาราง workflow_conversation
 * ห่อ PrismaService ตามแพทเทิร์นเดียวกับ repository อื่นในโปรเจกต์
 */
@Injectable()
export class WorkflowConversationRepository {
  constructor(private prisma: PrismaService) {}

  async findMany(
    condition: Prisma.WorkflowConversationFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.workflowConversation.findMany(condition);
  }

  async findOne(
    condition: Prisma.WorkflowConversationFindFirstArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.workflowConversation.findFirst(condition);
  }

  async create(
    condition: Prisma.WorkflowConversationCreateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.workflowConversation.create(condition);
  }

  async update(
    data: Prisma.WorkflowConversationUpdateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.workflowConversation.update(data);
  }

  async delete(
    condition: Prisma.WorkflowConversationDeleteArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.workflowConversation.delete(condition);
  }

  async count(
    condition: Prisma.WorkflowConversationCountArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.workflowConversation.count(condition);
  }
}
