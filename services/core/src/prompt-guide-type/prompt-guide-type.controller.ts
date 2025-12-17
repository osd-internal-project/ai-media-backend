import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { PromptGuideTypeService } from './prompt-guide-type.service';
import { Prisma } from '@prisma/client';

@Controller('prompt-guide-type')
export class PromptGuideTypeController {
  constructor(
    private readonly promptGuideTypeService: PromptGuideTypeService,
  ) {}

  @Post()
  create(
    @Body('body') createPromptGuideTypeDto: Prisma.PromptGuideTypeCreateInput,
  ) {
    return this.promptGuideTypeService.create(createPromptGuideTypeDto);
  }

  @Get()
  findAll() {
    return this.promptGuideTypeService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.promptGuideTypeService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body('body') updatePromptGuideTypeDto: Prisma.PromptGuideTypeUpdateInput,
  ) {
    return this.promptGuideTypeService.update(+id, updatePromptGuideTypeDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.promptGuideTypeService.remove(+id);
  }
}
