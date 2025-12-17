import { Injectable } from '@nestjs/common';
import { PromptGuideTypeRepository } from '@ai-media/share';
import { Prisma } from '@prisma/client';

@Injectable()
export class PromptGuideTypeService {
  constructor(
    private readonly promptGuideTypeRepo: PromptGuideTypeRepository,
  ) {}

  create(createPromptGuideTypeDto: Prisma.PromptGuideTypeCreateInput) {
    return this.promptGuideTypeRepo.create({ data: createPromptGuideTypeDto });
  }

  findAll() {
    return this.promptGuideTypeRepo.findMany({
      include: {
        promptGuide: {
          select: { id: true, title: true },
          orderBy: { id: 'asc' },
        },
      },
      orderBy: { id: 'asc' },
    });
  }

  findOne(id: number) {
    return this.promptGuideTypeRepo.findOne({
      where: { id },
      include: {
        promptGuide: true,
      },
    });
  }

  update(
    id: number,
    updatePromptGuideTypeDto: Prisma.PromptGuideTypeUpdateInput,
  ) {
    return this.promptGuideTypeRepo.update({
      where: { id },
      data: updatePromptGuideTypeDto,
    });
  }

  remove(id: number) {
    return this.promptGuideTypeRepo.delete({ where: { id } });
  }
}
