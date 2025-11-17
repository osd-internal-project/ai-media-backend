import { PrismaService } from '../modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { TQueryClient } from '../modules/prisma/types';
import { Prisma } from '@prisma/client';

@Injectable()
export class GalleryRepository {
  constructor(private prisma: PrismaService) {}
  async findAll(
    condition: Prisma.GalleryFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.gallery.findMany(condition);
  }
  async findMany(
    condition: Prisma.GalleryFindManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.gallery.findMany(condition);
  }
  async findOne(
    condition: Prisma.GalleryFindFirstArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.gallery.findFirst(condition);
  }
  async create(
    condition: Prisma.GalleryCreateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.gallery.create(condition);
  }
  async createMany(
    data: Prisma.GalleryCreateManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.gallery.createMany(data);
  }
  async update(
    data: Prisma.GalleryUpdateArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.gallery.update(data);
  }
  async delete(
    condition: Prisma.GalleryDeleteArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.gallery.delete(condition);
  }
  async deleteMany(
    condition: Prisma.GalleryDeleteManyArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.gallery.deleteMany(condition);
  }

  async count(
    condition: Prisma.GalleryCountArgs,
    option?: { prisma?: TQueryClient },
  ) {
    const prisma = option?.prisma ?? this.prisma;
    return prisma.gallery.count(condition);
  }
}
