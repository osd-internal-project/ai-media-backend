import { Injectable } from '@nestjs/common';
import { BrandKitDetailRepository } from '@ai-media/share';
import { Prisma } from '@prisma/client';

@Injectable()
export class BrandKitDetailService {
  constructor(private readonly brandKitDetailRepo: BrandKitDetailRepository) {}

  async create(data: Prisma.BrandKitDetailCreateInput) {
    return this.brandKitDetailRepo.create({ data });
  }

  async findAll(condition: Prisma.BrandKitDetailFindManyArgs) {
    return this.brandKitDetailRepo.findAll(condition);
  }

  async findOne(id: string) {
    return this.brandKitDetailRepo.findOne({
      where: { id },
    });
  }

  async findByBrandKitAndType(type: string, brandKitId: string) {
    return this.brandKitDetailRepo.findMany({
      where: { brandKitId, type },
    });
  }

  async findByBrandKit(brandKitId: string) {
    return this.brandKitDetailRepo.findMany({
      where: { brandKitId },
    });
  }

  async update(id: string, data: Prisma.BrandKitDetailUpdateInput) {
    return this.brandKitDetailRepo.update({
      where: { id },
      data,
    });
  }

  async remove(id: string) {
    return this.brandKitDetailRepo.delete({
      where: { id },
    });
  }
}
