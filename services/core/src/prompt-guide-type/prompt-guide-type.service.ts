import { Injectable } from '@nestjs/common';
import { PromptGuideTypeRepository } from '@ai-media/share';
import { Prisma } from '@prisma/client';

@Injectable()
export class PromptGuideTypeService {
  constructor(
    private readonly promptGuideTypeRepo: PromptGuideTypeRepository,
  ) {}

  create(createPromptGuideTypeDto: Prisma.PromptGuideTypeCreateInput) {
    const data = {
      ...createPromptGuideTypeDto,
      organizationId: createPromptGuideTypeDto.organizationId || null,
    };
    return this.promptGuideTypeRepo.create({ data });
  }

  findAll(organizationId?: string) {
    const whereType: Prisma.PromptGuideTypeWhereInput = organizationId
      ? {
          OR: [{ organizationId }, { organizationId: null }, { organizationId: '' }],
        }
      : {};

    const whereGuide: Prisma.PromptGuideWhereInput = organizationId
      ? {
          OR: [{ organizationId }, { organizationId: null }, { organizationId: '' }],
        }
      : {};

    return this.promptGuideTypeRepo.findMany({
      where: whereType,
      include: {
        promptGuide: {
          select: { id: true, title: true, organizationId: true },
          orderBy: { id: 'asc' },
          where: whereGuide,
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
    const data = {
      ...updatePromptGuideTypeDto,
      organizationId: updatePromptGuideTypeDto.organizationId || null,
    };
    return this.promptGuideTypeRepo.update({
      where: { id },
      data,
    });
  }

  remove(id: number) {
    return this.promptGuideTypeRepo.delete({ where: { id } });
  }
}
