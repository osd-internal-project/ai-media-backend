import { PrismaService } from '../modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { TQueryClient } from '../modules/prisma/types';
import { Prisma } from '@prisma/client';

/**
 * Repository สำหรับตาราง photo_event_photo (รูปที่นำเข้าของ Photo Event)
 * ห่อ PrismaService ตามแพทเทิร์นเดียวกับ repository อื่นในโปรเจกต์
 */
@Injectable()
export class PhotoEventPhotoRepository {
  constructor(private prisma: PrismaService) {}

  async findMany(
    condition: Prisma.PhotoEventPhotoFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.photoEventPhoto.findMany(condition);
  }

  async findOne(
    condition: Prisma.PhotoEventPhotoFindFirstArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.photoEventPhoto.findFirst(condition);
  }

  async create(
    condition: Prisma.PhotoEventPhotoCreateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.photoEventPhoto.create(condition);
  }

  async update(
    data: Prisma.PhotoEventPhotoUpdateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.photoEventPhoto.update(data);
  }

  async updateMany(
    data: Prisma.PhotoEventPhotoUpdateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.photoEventPhoto.updateMany(data);
  }

  async delete(
    condition: Prisma.PhotoEventPhotoDeleteArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.photoEventPhoto.delete(condition);
  }

  async count(
    condition: Prisma.PhotoEventPhotoCountArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.photoEventPhoto.count(condition);
  }

  /** รวม generations (ใหม่→เก่า) มาด้วย เพื่อให้ type ของ include ถูก infer */
  async findManyWithGenerations(
    condition: Omit<Prisma.PhotoEventPhotoFindManyArgs, 'include' | 'select'>,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.photoEventPhoto.findMany({
      ...condition,
      include: { generations: { orderBy: { createdAt: 'desc' } } },
    });
  }
}
