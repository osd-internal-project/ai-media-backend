import { Injectable } from '@nestjs/common';
import { CreatePromptGuideDto } from './dto/create-prompt-guide.dto';
import { UpdatePromptGuideDto } from './dto/update-prompt-guide.dto';
import { PromptGuideRepository } from '@ai-media/share';
import { Prisma } from '@prisma/client';

@Injectable()
export class PromptGuideService {
  constructor(private readonly promptguideRepo: PromptGuideRepository) {}
  create(createPromptGuideDto: Prisma.PromptGuideCreateInput) {
    const data = {
      ...createPromptGuideDto,
      organizationId: createPromptGuideDto.organizationId || null,
    };
    return this.promptguideRepo.create({ data });
  }

  findAll() {
    return this.promptguideRepo.findMany({});
  }

  findOne(id: number) {
    return this.promptguideRepo.findOne({ where: { id } });
  }

  update(id: number, updatePromptGuideDto: Prisma.PromptGuideUpdateInput) {
    const data = {
      ...updatePromptGuideDto,
      organizationId: updatePromptGuideDto.organizationId || null,
    };
    return this.promptguideRepo.update({
      where: {
        id,
      },
      data,
    });
  }

  remove(id: number) {
    return this.promptguideRepo.delete({ where: { id } });
  }

  findByOrganization(organizationId: string) {
    return this.promptguideRepo.findMany({
      where: {
        organizationId,
      },
    });
  }
}
