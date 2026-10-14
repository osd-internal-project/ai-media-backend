import { MasterdataModelTypeRepository } from '@ai-media/share';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

@Injectable()
export class MasterModelTypeService {
  constructor(
    private readonly masterModelTypeRepo: MasterdataModelTypeRepository,
  ) {}

  async create(data: Prisma.MasterModelTypeCreateInput) {
    return this.masterModelTypeRepo.create({ data });
  }

  async findAll() {
    return this.masterModelTypeRepo.findMany({
      where: { isActive: true },
      orderBy: { id: 'asc' },
    });
  }

  async findOne(id: number) {
    return this.masterModelTypeRepo.findOne({ where: { id, isActive: true } });
  }

  async update(id: number, data: Prisma.MasterModelTypeUpdateInput) {
    return this.masterModelTypeRepo.update({
      where: { id },
      data,
    });
  }

  async remove(id: number) {
    return this.masterModelTypeRepo.delete({ where: { id } });
  }
}
