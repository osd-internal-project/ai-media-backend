import { Injectable } from '@nestjs/common';
import { MasterDataConfigApiRepository } from '@ai-media/share';
import { Prisma } from '@prisma/client';

@Injectable()
export class MasteradataConfigApiService {
  constructor(
    private readonly masteradataconfigapiRepo: MasterDataConfigApiRepository,
  ) {}
  create(createbase: Prisma.MasterDataConfigApiCreateInput) {
    return this.masteradataconfigapiRepo.create({ data: createbase });
  }

  findAll() {
    return this.masteradataconfigapiRepo.findAll({});
  }
  findForConfig() {
    return this.masteradataconfigapiRepo.findOne({});
  }

  findOne(id: number) {
    return this.masteradataconfigapiRepo.findOne({ where: { id: id } });
  }

  update(
    id: number,
    updateMasteradataConfigApiDto: Prisma.MasterDataConfigApiUpdateInput,
  ) {
    return this.masteradataconfigapiRepo.update({
      where: { id: id },
      data: updateMasteradataConfigApiDto,
    });
  }

  remove(id: number) {
    return this.masteradataconfigapiRepo.delete({ where: { id: id } });
  }
}
