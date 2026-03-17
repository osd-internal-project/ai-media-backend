import { Injectable } from '@nestjs/common';
import { BrandKitDetailTypeRepository } from '@ai-media/share';
import { Prisma } from '@prisma/client';

@Injectable()
export class BrandKitDetailTypeService {
  constructor(
    private readonly brandKitDetailTypeRepo: BrandKitDetailTypeRepository,
  ) {}

  async create(data: Prisma.BrandKitDetailTypeCreateInput) {
    return this.brandKitDetailTypeRepo.create({ data });
  }

  async findAll() {
    return this.brandKitDetailTypeRepo.findAll({});
  }

  async findOne(id: string) {
    return this.brandKitDetailTypeRepo.findOne({
      where: { id },
    });
  }

  async update(id: string, data: Prisma.BrandKitDetailTypeUpdateInput) {
    return this.brandKitDetailTypeRepo.update({
      where: { id },
      data,
    });
  }

  async remove(id: string) {
    return this.brandKitDetailTypeRepo.delete({
      where: { id },
    });
  }
}
