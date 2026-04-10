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

  findAll(organizationId?: string, generateType?: string, model?: string) {
    const whereType: Prisma.PromptGuideTypeWhereInput = organizationId
      ? {
          OR: [
            { organizationId },
            { organizationId: null },
            { organizationId: '' },
          ],
          // promptGuide:{ coutn=}
          status: true,
        }
      : {};

    const whereGuide: Prisma.PromptGuideWhereInput = organizationId
      ? {
          OR: [
            { organizationId },
            { organizationId: null },
            { organizationId: '' },
          ],
          generateType: generateType,
          ...(model && { model }),
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

  findActive(organizationId?: string, generateType?: string) {
    return this.promptGuideTypeRepo.findOne({
      where: { organizationId, generateType, status: true },
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
