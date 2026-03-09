import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { MasterModelTypeService } from './master-model-type.service';
import { Prisma } from '@prisma/client';

@Controller('master-model-type')
export class MasterModelTypeController {
  constructor(private readonly masterModelTypeService: MasterModelTypeService) {}

  @Post()
  create(@Body() createMasterModelTypeDto: Prisma.MasterModelTypeCreateInput) {
    return this.masterModelTypeService.create(createMasterModelTypeDto);
  }

  @Get()
  findAll() {
    return this.masterModelTypeService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.masterModelTypeService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateMasterModelTypeDto: Prisma.MasterModelTypeUpdateInput) {
    return this.masterModelTypeService.update(+id, updateMasterModelTypeDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.masterModelTypeService.remove(+id);
  }
}
