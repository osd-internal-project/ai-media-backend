import { Injectable } from '@nestjs/common';
import { BrandKitRepository, BrandKitDetailRepository } from '@ai-media/share';
import { Prisma } from '@prisma/client';

@Injectable()
export class BrandKitService {
  constructor(
    private readonly brandKitRepo: BrandKitRepository,
    private readonly brandKitDetailRepo: BrandKitDetailRepository,
  ) {}

  async create(data: Prisma.BrandKitCreateInput) {
    return this.brandKitRepo.create({ data });
  }
  async setDefault(id: string) {
    const data = await this.brandKitRepo.findOne({ where: { id } });
    await this.brandKitRepo.updateMany({
      where: { organizationId: data.organizationId },
      data: { default: false },
    });
    return this.brandKitRepo.update({
      where: { id },
      data: { default: true },
    });
  }
  async findAll(condition: Prisma.BrandKitFindManyArgs) {
    return this.brandKitRepo.findAll(condition);
  }

  async findOne(id: string) {
    return this.brandKitRepo.findOne({
      where: { id },
      include: { brandKitDetails: true },
    });
  }
  async findDefaultByOrganization(organizationId: string) {
    return this.brandKitRepo.findOne({
      where: { organizationId, default: true },
    });
  }
  async findByOrganization(organizationId: string) {
    return this.brandKitRepo.findMany({
      where: { organizationId },
      include: { brandKitDetails: true },
    });
  }

  async update(id: string, data: Prisma.BrandKitUpdateInput) {
    return this.brandKitRepo.update({
      where: { id },
      data,
    });
  }

  async remove(id: string) {
    // Delete details first if not handled by CASCADE
    await this.brandKitDetailRepo.deleteMany({
      where: { brandKitId: id },
    });
    return this.brandKitRepo.delete({
      where: { id },
    });
  }
}
