import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { PromptGuideService } from './prompt-guide.service';
import { Prisma } from '@prisma/client';

@Controller('prompt-guide')
export class PromptGuideController {
  constructor(private readonly promptGuideService: PromptGuideService) {}

  @Post()
  create(@Body('body') createPromptGuideDto: Prisma.PromptGuideCreateInput) {
    return this.promptGuideService.create(createPromptGuideDto);
  }

  @Get()
  findAll() {
    return this.promptGuideService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.promptGuideService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body('body') updatePromptGuideDto: Prisma.PromptGuideUpdateInput,
  ) {
    return this.promptGuideService.update(+id, updatePromptGuideDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.promptGuideService.remove(+id);
  }

  @Get('organization/:organizationId')
  findByOrganization(
    @Param('organizationId') organizationId: string,
    @Query('model') model?: string,
  ) {
    return this.promptGuideService.findByOrganization(organizationId, { model });
  }
  @Get('type/:promptGuideTypeId')
  findWithImageByTypes(@Param('promptGuideTypeId') promptGuideTypeId: string) {
    return this.promptGuideService.findWithImageByTypes(+promptGuideTypeId);
  }
  @Get(':id/images')
  findImagesByPromptGuideId(@Param('id') id: string) {
    return this.promptGuideService.findImagesByPromptGuideId(+id);
  }

  @Get(':id/images-with-urls')
  getPromptGuideImages(@Param('id') id: string) {
    return this.promptGuideService.getPromptGuideImages(+id);
  }

  @Get(':id/results')
  getPromptGuideResults(@Param('id') id: string) {
    return this.promptGuideService.getPromptGuideResults(+id);
  }
}
