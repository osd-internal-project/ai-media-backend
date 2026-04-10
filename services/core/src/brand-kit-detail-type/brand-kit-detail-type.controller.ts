import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { BrandKitDetailTypeService } from './brand-kit-detail-type.service';
import { Prisma } from '@prisma/client';

@Controller('brand-kit-detail-type')
export class BrandKitDetailTypeController {
  constructor(private readonly brandKitDetailTypeService: BrandKitDetailTypeService) {}

  @Post()
  create(@Body() data: Prisma.BrandKitDetailTypeCreateInput) {
    return this.brandKitDetailTypeService.create(data);
  }

  @Get()
  findAll() {
    return this.brandKitDetailTypeService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.brandKitDetailTypeService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() data: Prisma.BrandKitDetailTypeUpdateInput,
  ) {
    return this.brandKitDetailTypeService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.brandKitDetailTypeService.remove(id);
  }
}
