import { Injectable } from '@nestjs/common';
import { CreatePromptGuideDto } from './dto/create-prompt-guide.dto';
import { UpdatePromptGuideDto } from './dto/update-prompt-guide.dto';
import { PromptGuideRepository } from '@ai-media/share';
import { Prisma } from '@prisma/client';

@Injectable()
export class PromptGuideService {
  constructor(private readonly promptguideRepo: PromptGuideRepository) {}
  create(createPromptGuideDto: Prisma.PromptGuideCreateInput) {
    return this.promptguideRepo.create({ data: createPromptGuideDto });
  }

  findAll() {
    return this.promptguideRepo.findMany({});
  }

  findOne(id: number) {
    return `This action returns a #${id} promptGuide`;
  }

  update(id: number, updatePromptGuideDto: Prisma.PromptGuideUpdateInput) {
    return this.promptguideRepo.update({
      where: {
        id,
      },
      data: updatePromptGuideDto,
    });
  }

  remove(id: number) {
    return this.promptguideRepo.delete({ where: { id } });
  }
}
