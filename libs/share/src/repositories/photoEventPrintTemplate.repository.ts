import { PrismaService } from '../modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { TQueryClient } from '../modules/prisma/types';
import { Prisma } from '@prisma/client';

/**
 * Repository สำหรับตาราง photo_event_print_template (layout การ์ดที่พิมพ์ของ Photo Event)
 * ห่อ PrismaService ตามแพทเทิร์นเดียวกับ repository อื่นในโปรเจกต์
 */
@Injectable()
export class PhotoEventPrintTemplateRepository {
  constructor(private prisma: PrismaService) {}

  async findMany(
    condition: Prisma.PhotoEventPrintTemplateFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.photoEventPrintTemplate.findMany(condition);
  }

  async findOne(
    condition: Prisma.PhotoEventPrintTemplateFindFirstArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.photoEventPrintTemplate.findFirst(condition);
  }

  async create(
    condition: Prisma.PhotoEventPrintTemplateCreateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.photoEventPrintTemplate.create(condition);
  }

  async update(
    data: Prisma.PhotoEventPrintTemplateUpdateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.photoEventPrintTemplate.update(data);
  }

  async updateMany(
    data: Prisma.PhotoEventPrintTemplateUpdateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.photoEventPrintTemplate.updateMany(data);
  }

  async delete(
    condition: Prisma.PhotoEventPrintTemplateDeleteArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.photoEventPrintTemplate.delete(condition);
  }
}
