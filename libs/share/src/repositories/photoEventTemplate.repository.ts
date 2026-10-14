import { PrismaService } from '../modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { TQueryClient } from '../modules/prisma/types';
import { Prisma } from '@prisma/client';

/**
 * Repository สำหรับตาราง photo_event_template (template ของ Photo Event ที่ผูกกับ project)
 * ห่อ PrismaService ตามแพทเทิร์นเดียวกับ repository อื่นในโปรเจกต์
 */
@Injectable()
export class PhotoEventTemplateRepository {
  constructor(private prisma: PrismaService) {}

  async findMany(
    condition: Prisma.PhotoEventTemplateFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.photoEventTemplate.findMany(condition);
  }

  async findOne(
    condition: Prisma.PhotoEventTemplateFindFirstArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.photoEventTemplate.findFirst(condition);
  }

  async create(
    condition: Prisma.PhotoEventTemplateCreateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.photoEventTemplate.create(condition);
  }

  async update(
    data: Prisma.PhotoEventTemplateUpdateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.photoEventTemplate.update(data);
  }

  async updateMany(
    data: Prisma.PhotoEventTemplateUpdateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.photoEventTemplate.updateMany(data);
  }

  async delete(
    condition: Prisma.PhotoEventTemplateDeleteArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.photoEventTemplate.delete(condition);
  }

  async deleteMany(
    condition: Prisma.PhotoEventTemplateDeleteManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.photoEventTemplate.deleteMany(condition);
  }

  async createMany(
    condition: Prisma.PhotoEventTemplateCreateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.photoEventTemplate.createMany(condition);
  }

  async count(
    condition: Prisma.PhotoEventTemplateCountArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.photoEventTemplate.count(condition);
  }

  /** รวม PromptGuide มาด้วย เพื่อให้ type ของ include ถูก infer */
  async findManyWithPromptGuide(
    condition: Omit<
      Prisma.PhotoEventTemplateFindManyArgs,
      'include' | 'select'
    >,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.photoEventTemplate.findMany({
      ...condition,
      include: { promptGuide: true },
    });
  }

  async findOneWithPromptGuide(
    condition: Omit<
      Prisma.PhotoEventTemplateFindFirstArgs,
      'include' | 'select'
    >,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.photoEventTemplate.findFirst({
      ...condition,
      include: { promptGuide: true },
    });
  }
}
