import { Controller, Get, Param, Query } from '@nestjs/common';
import { AiModelService } from './ai-model.service';

@Controller('ai-models')
export class AiModelController {
  constructor(private readonly aiModelService: AiModelService) {}

  @Get()
  async findAll(@Query('type') type?: string) {
    return this.aiModelService.findAll(type);
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.aiModelService.findById(+id);
  }
}